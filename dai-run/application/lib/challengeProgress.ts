import { getPool } from '@/lib/db';

type SyncableMetric = 'DISTANCE' | 'COUNT' | 'STREAK';

type ParticipationRow = {
  participation_id: string;
  challenge_id: string;
  user_id: string;
  status: string;
  progress_value: string;
  streak_count: number;
  joined_at: string;
  completed_at: string | null;
  metric_type: SyncableMetric;
  target_value: string;
  start_at: string;
  end_at: string;
  challenge_status: string;
  challenge_type: string;
  name: string;
};

// running_record.runs에 새 완료 기록이 생겼거나 자정이 지나 챌린지 기간이 끝났을 때
// challenge_participations/challenge_progress_events를 최신 상태로 맞춘다. 별도 스케줄러 없이,
// 챌린지 목록/상세를 조회할 때(lib/challenges.ts)마다 먼저 이 함수를 호출해 "그때그때" 반영한다.
//
// PACE(목표 페이스 유지) 챌린지는 challenge_progress_events.increment_value가 0 이상이어야 하는
// DB 제약(누적만 가능, 감소 불가) 때문에 "현재 평균 페이스"처럼 좋아졌다 나빠질 수 있는 값을 이
// 원장에 그대로 담을 수 없다. 그래서 이 자동 동기화는 DISTANCE/COUNT/STREAK만 다루고, PACE는
// 지금처럼 시드된 값으로 남겨둔다 — 실시간 반영은 별도 설계가 필요해 이번 범위에서 제외했다.
export async function syncUserChallengeProgress(userId: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query<ParticipationRow>(
    `SELECT p.participation_id, p.challenge_id, p.user_id, p.status, p.progress_value,
            p.streak_count, p.joined_at, p.completed_at,
            c.metric_type, c.target_value, c.start_at, c.end_at, c.status AS challenge_status,
            c.challenge_type, c.name
       FROM challenge.challenge_participations p
       JOIN challenge.challenges c ON c.challenge_id = p.challenge_id
      WHERE p.user_id = $1 AND p.status = 'ACTIVE' AND c.metric_type IN ('DISTANCE', 'COUNT', 'STREAK')`,
    [userId]
  );

  for (const row of rows) {
    await syncParticipation(row);
  }
}

async function syncParticipation(row: ParticipationRow) {
  const pool = getPool();
  const now = new Date();
  const startAt = new Date(row.start_at);
  const endAt = new Date(row.end_at);
  if (now < startAt) return;

  const windowEnd = now < endAt ? now : endAt;

  const { rows: newRuns } = await pool.query(
    `SELECT r.run_id, r.distance_m, r.started_at
       FROM running_record.runs r
      WHERE r.user_id = $1 AND r.status = 'COMPLETED'
        AND r.started_at >= $2 AND r.started_at <= $3
        AND NOT EXISTS (
          SELECT 1 FROM challenge.challenge_progress_events e
           WHERE e.participation_id = $4 AND e.source_event_id = r.run_id
        )
      ORDER BY r.started_at ASC`,
    [row.user_id, row.joined_at, windowEnd.toISOString(), row.participation_id]
  );

  if (newRuns.length === 0) {
    await finalizeIfPeriodEnded(row, Number(row.progress_value));
    return;
  }

  let progressValue = Number(row.progress_value);
  let streakCount = row.streak_count;

  const { rows: lastRuns } = await pool.query(
    `SELECT MAX((r.started_at AT TIME ZONE 'Asia/Seoul')::date) AS last_date
       FROM challenge.challenge_progress_events e
       JOIN running_record.runs r ON r.run_id = e.source_event_id
      WHERE e.participation_id = $1`,
    [row.participation_id]
  );
  let lastCountedDate: string | null = lastRuns[0]?.last_date
    ? new Date(lastRuns[0].last_date).toISOString().slice(0, 10)
    : null;

  for (const run of newRuns) {
    let increment = 0;
    if (row.metric_type === 'DISTANCE') {
      increment = Number(run.distance_m) / 1000;
    } else if (row.metric_type === 'COUNT') {
      increment = 1;
    } else {
      const runDate = new Date(run.started_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
      if (runDate === lastCountedDate) {
        increment = 0; // 같은 날 이미 세었으면 중복 반영하지 않는다.
      } else {
        const isConsecutive = lastCountedDate
          ? new Date(runDate).getTime() - new Date(lastCountedDate).getTime() === 86_400_000
          : true;
        streakCount = isConsecutive ? streakCount + 1 : 1;
        increment = 1; // progress_value(누적 인정 일수)는 항상 증가, streak_count만 끊기면 리셋된다.
        lastCountedDate = runDate;
      }
    }

    const progressBefore = progressValue;
    const progressAfter = progressBefore + increment;
    await pool.query(
      `INSERT INTO challenge.challenge_progress_events
         (participation_id, source_event_id, run_id, increment_value, progress_before, progress_after, occurred_at)
       VALUES ($1, $2, $2, $3, $4, $5, $6)`,
      [row.participation_id, run.run_id, increment, progressBefore, progressAfter, run.started_at]
    );
    progressValue = progressAfter;
  }

  await applyProgress(row, progressValue, streakCount);
}

async function finalizeIfPeriodEnded(row: ParticipationRow, progressValue: number) {
  if (new Date() > new Date(row.end_at)) {
    await applyProgress(row, progressValue, row.streak_count);
  }
}

async function applyProgress(row: ParticipationRow, progressValue: number, streakCount: number) {
  const pool = getPool();
  const targetValue = Number(row.target_value);
  const progressRatio = Math.min(100, targetValue > 0 ? (progressValue / targetValue) * 100 : 0);
  const isPastEnd = new Date() > new Date(row.end_at);
  const reachedTarget = progressValue >= targetValue;
  const newStatus = isPastEnd ? (reachedTarget ? 'COMPLETED' : 'FAILED') : row.status;
  const completedAt = newStatus === 'COMPLETED' ? (row.completed_at ?? new Date().toISOString()) : row.completed_at;

  await pool.query(
    `UPDATE challenge.challenge_participations
        SET progress_value = $1, progress_ratio = $2, streak_count = $3, status = $4, completed_at = $5
      WHERE participation_id = $6`,
    [progressValue, progressRatio, streakCount, newStatus, completedAt, row.participation_id]
  );

  // syncUserChallengeProgress는 status='ACTIVE'인 참가만 조회하므로(위 SELECT 참고), 이 함수가
  // 호출됐다는 것 자체가 row.status는 항상 ACTIVE였다는 뜻 — newStatus가 COMPLETED면 지금 이
  // 호출에서 막 완주로 전환된 것이라 알림도 정확히 한 번만 나간다.
  if (newStatus === 'COMPLETED' && row.challenge_type === 'PERSONAL') {
    await pool.query(
      `INSERT INTO notification.notifications (user_id, notification_type, title, body, target_url, reference_type, reference_id)
       VALUES ($1, 'CHALLENGE_COMPLETED', '챌린지 달성 성공!', $2, $3, 'CHALLENGE', $4)`,
      [row.user_id, `'${row.name}' 챌린지 달성에 성공했어요!`, `/challenges/${row.challenge_id}`, row.challenge_id]
    );
  }

  // 완주가 확정되면 이 참가에 걸려있던 진행 이벤트 원장은 더 이상 필요 없다 — 동기화 대상은
  // status='ACTIVE'인 참가만이라(syncUserChallengeProgress 참고) COMPLETED로 넘어간 참가는
  // 다시는 이 함수를 안 타므로, 여기서 한 번만 지워도 안전하다(중복 실행 걱정 없음).
  if (newStatus === 'COMPLETED') {
    await pool.query(`DELETE FROM challenge.challenge_progress_events WHERE participation_id = $1`, [row.participation_id]);
  }

  if (isPastEnd && row.challenge_status === 'ACTIVE') {
    await pool.query(`UPDATE challenge.challenges SET status = 'COMPLETED', updated_at = now() WHERE challenge_id = $1`, [
      row.challenge_id
    ]);
  }
}
