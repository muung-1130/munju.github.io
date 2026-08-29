import { getPool } from '@/lib/db';
import type { RunCompletedEventPayload } from '@/lib/kafka';

function kstDateStr(value: string | Date): string {
  return new Date(value).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function kstHour(iso: string): number {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCHours();
}

// "HH:MM:SS" 형태로 KST 기준 시:분:초만 뽑아 challenge_rules의 time 컬럼과 문자열로 비교한다.
function kstTimeOfDay(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

type ParticipationRow = {
  participation_id: string;
  progress_value: string;
  streak_count: number;
  status: string;
  challenge_id: string;
  challenge_type: string;
  name: string;
  metric_type: 'DISTANCE' | 'COUNT' | 'PACE' | 'STREAK';
  target_value: string;
  min_distance_m: number | null;
  max_distance_m: number | null;
  min_pace_sec_per_km: number | null;
  max_pace_sec_per_km: number | null;
  min_duration_sec: number | null;
  max_duration_sec: number | null;
  min_avg_heart_rate: number | null;
  max_avg_heart_rate: number | null;
  min_avg_cadence: number | null;
  min_elevation_gain_m: string | null;
  allowed_source_types: string[] | null;
  start_time_of_day: string | null;
  end_time_of_day: string | null;
  extra_conditions: { before_hour_kst?: number } | null;
};

// challenge_rules의 min/max 컬럼들을 이번 러닝 기록과 비교해서, 이 러닝이 챌린지 진행도에
// 반영될 자격이 있는지 판단한다. 컬럼이 NULL이면 그 조건은 검사하지 않는다.
function runQualifies(run: RunCompletedEventPayload, rule: ParticipationRow): boolean {
  if (rule.min_distance_m !== null && run.distanceM < rule.min_distance_m) return false;
  if (rule.max_distance_m !== null && run.distanceM > rule.max_distance_m) return false;
  if (rule.min_pace_sec_per_km !== null && (run.averagePaceSecPerKm === null || run.averagePaceSecPerKm < rule.min_pace_sec_per_km)) return false;
  if (rule.max_pace_sec_per_km !== null && (run.averagePaceSecPerKm === null || run.averagePaceSecPerKm > rule.max_pace_sec_per_km)) return false;
  if (rule.min_duration_sec !== null && (run.durationSec === null || run.durationSec < rule.min_duration_sec)) return false;
  if (rule.max_duration_sec !== null && (run.durationSec === null || run.durationSec > rule.max_duration_sec)) return false;
  if (rule.min_avg_heart_rate !== null && (run.averageHeartRate === null || run.averageHeartRate < rule.min_avg_heart_rate)) return false;
  if (rule.max_avg_heart_rate !== null && (run.averageHeartRate === null || run.averageHeartRate > rule.max_avg_heart_rate)) return false;
  if (rule.min_avg_cadence !== null && (run.averageCadence === null || run.averageCadence < rule.min_avg_cadence)) return false;
  if (rule.min_elevation_gain_m !== null && (run.elevationGainM === null || run.elevationGainM < Number(rule.min_elevation_gain_m))) return false;
  if (rule.allowed_source_types && rule.allowed_source_types.length > 0 && !rule.allowed_source_types.includes(run.sourceType)) return false;
  if (rule.extra_conditions?.before_hour_kst !== undefined && kstHour(run.startedAt) >= rule.extra_conditions.before_hour_kst) return false;
  // 시작 시각(started_at)은 사용자가 수동 입력 시 임의로 적을 수 있어 믿을 수 없다 — 서버가
  // 실제로 기록을 받은 시각(created_at)을 기준으로 시간대 조건을 검사한다.
  if (rule.start_time_of_day !== null || rule.end_time_of_day !== null) {
    const createdTime = kstTimeOfDay(run.createdAt);
    if (rule.start_time_of_day !== null && createdTime < rule.start_time_of_day) return false;
    if (rule.end_time_of_day !== null && createdTime > rule.end_time_of_day) return false;
  }
  return true;
}

async function getLastStreakDate(participationId: string): Promise<string | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT occurred_at FROM challenge.challenge_progress_events
      WHERE participation_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
    [participationId]
  );
  return rows.length > 0 ? kstDateStr(rows[0].occurred_at) : null;
}

export type ChallengeProgressResult = { completedChallengeNames: string[] };

// run-completion-consumer가 RunCompleted 이벤트를 받을 때마다 호출한다. source_event_id +
// participation_id UNIQUE 제약으로 같은 이벤트가 재전달돼도 진행도가 중복 반영되지 않는다.
export async function applyChallengeProgress(eventId: string, run: RunCompletedEventPayload): Promise<ChallengeProgressResult> {
  const pool = getPool();
  const completedChallengeNames: string[] = [];

  const { rows: participations } = await pool.query<ParticipationRow>(
    `SELECT p.participation_id, p.progress_value, p.streak_count, p.status,
            c.challenge_id, c.challenge_type, c.name, c.metric_type, c.target_value,
            r.min_distance_m, r.max_distance_m, r.min_pace_sec_per_km, r.max_pace_sec_per_km,
            r.min_duration_sec, r.max_duration_sec, r.min_avg_heart_rate, r.max_avg_heart_rate,
            r.min_avg_cadence, r.min_elevation_gain_m, r.allowed_source_types,
            r.start_time_of_day, r.end_time_of_day, r.extra_conditions
       FROM challenge.challenge_participations p
       JOIN challenge.challenges c ON c.challenge_id = p.challenge_id
       LEFT JOIN challenge.challenge_rules r ON r.challenge_id = c.challenge_id
      WHERE p.user_id = $1 AND p.status = 'ACTIVE' AND c.status = 'ACTIVE'
        AND c.start_at <= $2::timestamptz AND c.end_at >= $2::timestamptz`,
    [run.userId, run.completedAt]
  );

  for (const p of participations) {
    if (!runQualifies(run, p)) continue;

    const progressBefore = Number(p.progress_value);
    const targetValue = Number(p.target_value);
    let progressAfter = progressBefore;
    let newStreak = p.streak_count;

    if (p.metric_type === 'STREAK') {
      // 스트릭은 하루에 여러 번 뛰어도 하루치만 인정한다. 어제까지 이어졌으면 +1(=append-only
      // increment, 정상적으로 이벤트 로그에 남김). 끊겼다가 다시 시작하는 경우(리셋)는 "증가"가
      // 아니라서 challenge_progress_events(increment_value >= 0 제약)에는 안 남기고
      // challenge_participations만 직접 갱신한다.
      const runDate = kstDateStr(run.completedAt);
      const lastDate = await getLastStreakDate(p.participation_id);
      if (lastDate === runDate) continue; // 오늘 이미 반영됨

      const isConsecutive = lastDate === addDaysStr(runDate, -1);
      if (!isConsecutive) {
        await pool.query(
          `UPDATE challenge.challenge_participations
              SET progress_value = 1, progress_ratio = LEAST(100, (1.0 / $2) * 100), streak_count = 1
            WHERE participation_id = $1`,
          [p.participation_id, targetValue]
        );
        continue;
      }
      newStreak = p.streak_count + 1;
      progressAfter = progressBefore + 1;
    } else if (p.metric_type === 'DISTANCE') {
      progressAfter = progressBefore + run.distanceM / 1000;
    } else if (p.metric_type === 'COUNT') {
      progressAfter = progressBefore + 1;
    } else if (p.metric_type === 'PACE') {
      // target_value(초/km)를 이 러닝의 페이스가 달성했으면 그 즉시 100%로 채운다 — "누적"이 아니라
      // "이 페이스로 한 번이라도 뛰면 달성"하는 방식의 목표라고 해석했다. progress_value가 이미
      // target_value 이상이면(레거시 시드 데이터 등) 더 채울 게 없으니 그대로 둔다 — increment_value가
      // 음수가 되면 안 된다는 제약과 충돌하지 않게 max로 클램프한다.
      if (run.averagePaceSecPerKm !== null && run.averagePaceSecPerKm <= targetValue) {
        progressAfter = Math.max(progressBefore, targetValue);
      } else {
        continue;
      }
    } else {
      continue;
    }

    if (progressAfter === progressBefore) continue;

    const { rows: insertedRows } = await pool.query(
      `INSERT INTO challenge.challenge_progress_events
         (participation_id, source_event_id, run_id, increment_value, progress_before, progress_after, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (source_event_id, participation_id) DO NOTHING
       RETURNING progress_event_id`,
      [p.participation_id, eventId, run.runId, progressAfter - progressBefore, progressBefore, progressAfter, run.completedAt]
    );
    if (insertedRows.length === 0) continue; // 이미 처리된 이벤트(at-least-once 재전달 방지)

    const ratio = Math.min(100, (progressAfter / targetValue) * 100);
    const isNowComplete = progressAfter >= targetValue && p.status !== 'COMPLETED';

    await pool.query(
      `UPDATE challenge.challenge_participations
          SET progress_value = $2, progress_ratio = $3, streak_count = $4,
              status = CASE WHEN $5 THEN 'COMPLETED' ELSE status END,
              completed_at = CASE WHEN $5 THEN now() ELSE completed_at END
        WHERE participation_id = $1`,
      [p.participation_id, progressAfter, ratio, newStreak, isNowComplete]
    );

    if (isNowComplete) {
      completedChallengeNames.push(p.name);
      // 개인 챌린지는 완주해도 그룹 참가 현황 같은 다른 화면에서 눈에 띄지 않으니, 완주 순간
      // 알림으로 한 번 알려준다. 진행도 이벤트(challenge_progress_events)가 이미
      // (source_event_id, participation_id) UNIQUE로 같은 러닝 이벤트의 중복 처리를 막아주므로
      // (line 149의 continue) 여기 도달했다는 것 자체가 "처음 완주한 순간"이라 별도 멱등키 없이도
      // 한 번만 실행된다.
      if (p.challenge_type === 'PERSONAL') {
        await pool.query(
          `INSERT INTO notification.notifications (user_id, notification_type, title, body, target_url, reference_type, reference_id)
           VALUES ($1, 'CHALLENGE_COMPLETED', '챌린지 달성 성공!', $2, $3, 'CHALLENGE', $4)`,
          [run.userId, `'${p.name}' 챌린지 달성에 성공했어요!`, `/challenges/${p.challenge_id}`, p.challenge_id]
        );
      }
    }
  }

  return { completedChallengeNames };
}
