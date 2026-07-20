import { getPool } from '@/lib/db';
import type { MetricType, ChallengeType } from '@/lib/challengeFormat';
import { syncUserChallengeProgress } from '@/lib/challengeProgress';

export type { MetricType, ChallengeType };

export type ChallengeSummary = {
  challengeId: string;
  challengeType: ChallengeType;
  name: string;
  description: string | null;
  metricType: MetricType;
  targetValue: number;
  startAt: string;
  endAt: string;
  status: string;
  participantCount: number;
  myProgressValue: number | null;
  myProgressRatio: number | null;
  myStatus: string | null;
};

function mapSummaryRow(row: Record<string, unknown>): ChallengeSummary {
  return {
    challengeId: row.challenge_id as string,
    challengeType: row.challenge_type as ChallengeType,
    name: row.name as string,
    description: row.description as string | null,
    metricType: row.metric_type as MetricType,
    targetValue: Number(row.target_value),
    startAt: row.start_at as string,
    endAt: row.end_at as string,
    status: row.status as string,
    participantCount: Number(row.participant_count ?? 0),
    myProgressValue: row.my_progress_value !== null && row.my_progress_value !== undefined ? Number(row.my_progress_value) : null,
    myProgressRatio: row.my_progress_ratio !== null && row.my_progress_ratio !== undefined ? Number(row.my_progress_ratio) : null,
    myStatus: (row.my_status as string) ?? null
  };
}

// 개인 챌린지: "혼자서 하는 챌린지" — 내가 만든(=참여하는) PERSONAL 챌린지만 보여준다.
export async function getPersonalChallenges(userId: string): Promise<ChallengeSummary[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT c.challenge_id, c.challenge_type, c.name, c.description, c.metric_type, c.target_value,
            c.start_at, c.end_at, c.status,
            1 AS participant_count,
            cp.progress_value AS my_progress_value, cp.progress_ratio AS my_progress_ratio, cp.status AS my_status
       FROM challenge.challenges c
       LEFT JOIN challenge.challenge_participations cp ON cp.challenge_id = c.challenge_id AND cp.user_id = $1
      WHERE c.challenge_type = 'PERSONAL' AND c.creator_user_id = $1
      ORDER BY c.status = 'ACTIVE' DESC, c.start_at DESC`,
    [userId]
  );
  return rows.map(mapSummaryRow);
}

// 공개 챌린지: "다같이 참가하는 챌린지" — 진행중/완료된 PUBLIC 챌린지를 참가자 수와 함께 보여준다.
export async function getPublicChallenges(userId: string | null): Promise<ChallengeSummary[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT c.challenge_id, c.challenge_type, c.name, c.description, c.metric_type, c.target_value,
            c.start_at, c.end_at, c.status,
            (SELECT COUNT(*) FROM challenge.challenge_participations p WHERE p.challenge_id = c.challenge_id) AS participant_count,
            cp.progress_value AS my_progress_value, cp.progress_ratio AS my_progress_ratio, cp.status AS my_status
       FROM challenge.challenges c
       LEFT JOIN challenge.challenge_participations cp
         ON cp.challenge_id = c.challenge_id AND cp.user_id = $1 AND cp.status = 'ACTIVE'
      WHERE c.challenge_type = 'PUBLIC' AND c.visibility = 'PUBLIC' AND c.status IN ('ACTIVE', 'COMPLETED')
      ORDER BY c.status = 'ACTIVE' DESC, c.start_at DESC`,
    [userId]
  );
  return rows.map(mapSummaryRow);
}

export type ChallengeDetail = ChallengeSummary & {
  visibility: string;
  creatorNickname: string | null;
  crewName: string | null;
  createdAt: string;
};

export async function getChallengeDetail(challengeId: string, userId: string | null): Promise<ChallengeDetail | null> {
  if (userId) await syncUserChallengeProgress(userId);
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT c.challenge_id, c.challenge_type, c.name, c.description, c.metric_type, c.target_value,
            c.start_at, c.end_at, c.status, c.visibility, c.created_at,
            u.nickname AS creator_nickname,
            crew.crew_name,
            (SELECT COUNT(*) FROM challenge.challenge_participations p WHERE p.challenge_id = c.challenge_id) AS participant_count,
            cp.progress_value AS my_progress_value, cp.progress_ratio AS my_progress_ratio, cp.status AS my_status
       FROM challenge.challenges c
       LEFT JOIN auth_user.users u ON u.user_id = c.creator_user_id
       LEFT JOIN crew.crews crew ON crew.crew_id = c.crew_id
       LEFT JOIN challenge.challenge_participations cp
         ON cp.challenge_id = c.challenge_id AND cp.user_id = $2 AND cp.status = 'ACTIVE'
      WHERE c.challenge_id = $1`,
    [challengeId, userId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ...mapSummaryRow(row),
    visibility: row.visibility,
    creatorNickname: row.creator_nickname,
    crewName: row.crew_name,
    createdAt: row.created_at
  };
}

export type HallOfFameEntry = {
  userId: string;
  nickname: string;
  successCount: number;
  lastCompletedAt: string;
};

// 챌린지별 "완주 횟수" 명예의 전당.
//
// challenge_participations에는 (challenge_id, user_id) UNIQUE 제약(uq_challenge_user)이 있어
// 같은 사용자가 같은 챌린지를 두 번 완료하는 건 애초에 불가능하다 — 즉 "이 챌린지 하나를 몇 번
// 완료했는가"는 항상 0 또는 1이라 랭킹 기준이 될 수 없다. 그래서 "횟수"는 이 챌린지 참가자들
// 중에서 "지금까지 완주한 챌린지 개수(전체)"로 해석해 랭킹을 매긴다 — 이 챌린지 상세 페이지에
// "챌린지를 많이 완주해본" 참가자를 보여주는 형태다.
//
// 별도 카운터 테이블(challenge_id, user_id, count) 없이 집계 쿼리로 처리했다: 이 챌린지
// 참가자 목록(보통 수십~수백 명)을 먼저 좁힌 뒤, 그 사용자들의 전체 COMPLETED 참가 기록을
// (user_id, status) 인덱스로 집계하면 되므로 PoC 트래픽 규모에서는 카운터 테이블을 유지보수하는
// 것보다 훨씬 단순하고 일관성 문제(이벤트 누락 시 카운터가 실제 값과 어긋나는 문제)도 없다.
// 사용자 수가 훨씬 커지고 이 조회가 핫패스가 되면(예: 매우 큰 챌린지의 실시간 랭킹) 그때
// 비동기로 갱신되는 요약 테이블을 검토하면 된다.
export async function getHallOfFame(challengeId: string, limit = 20): Promise<HallOfFameEntry[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT p.user_id, u.nickname, s.success_count, s.last_completed_at
       FROM (SELECT DISTINCT user_id FROM challenge.challenge_participations WHERE challenge_id = $1 AND user_id IS NOT NULL) p
       JOIN auth_user.users u ON u.user_id = p.user_id
       JOIN (
         SELECT user_id, COUNT(*) AS success_count, MAX(completed_at) AS last_completed_at
           FROM challenge.challenge_participations
          WHERE status = 'COMPLETED'
          GROUP BY user_id
       ) s ON s.user_id = p.user_id
      ORDER BY s.success_count DESC, s.last_completed_at ASC
      LIMIT $2`,
    [challengeId, limit]
  );
  return rows.map((row) => ({
    userId: row.user_id,
    nickname: row.nickname,
    successCount: Number(row.success_count),
    lastCompletedAt: row.last_completed_at
  }));
}

export type LiveParticipant = {
  userId: string;
  nickname: string;
  progressValue: number;
  progressRatio: number;
  status: string;
  joinedAt: string;
};

// 공개 챌린지 참가자의 실시간(폴링) 달성률 목록. joined_at 내림차순 정렬이라 오늘 참여한
// 사람부터 전날, 그 전날 순으로 자연스럽게 묶여서 보인다.
export async function getLiveParticipants(challengeId: string, limit = 50): Promise<LiveParticipant[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT cp.user_id, u.nickname, cp.progress_value, cp.progress_ratio, cp.status, cp.joined_at
       FROM challenge.challenge_participations cp
       JOIN auth_user.users u ON u.user_id = cp.user_id
      WHERE cp.challenge_id = $1
      ORDER BY cp.joined_at DESC
      LIMIT $2`,
    [challengeId, limit]
  );
  return rows.map((row) => ({
    userId: row.user_id,
    nickname: row.nickname,
    progressValue: Number(row.progress_value),
    progressRatio: Number(row.progress_ratio),
    status: row.status,
    joinedAt: row.joined_at
  }));
}

export type ChallengeWeeklyProgress = {
  challengeId: string;
  name: string;
  metricType: MetricType;
  progressRatio: number;
  days: { dayLabel: string; value: number; isToday: boolean }[];
};

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toDateStr(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

// 마이페이지 "하고 있는 챌린지" — 참여중인(ACTIVE) 챌린지별로 오늘을 포함한 이번 주 월~일
// 일별 진행량(challenge_progress_events의 increment_value 합)을 보여준다. 완료 즉시
// progress_events가 정리되는 챌린지 특성상 이 뷰는 ACTIVE 참가만 대상으로 한다.
export async function getMyActiveChallengesWeeklyProgress(userId: string): Promise<ChallengeWeeklyProgress[]> {
  const pool = getPool();
  const { rows: participations } = await pool.query(
    `SELECT p.participation_id, p.challenge_id, p.progress_ratio, c.name, c.metric_type
       FROM challenge.challenge_participations p
       JOIN challenge.challenges c ON c.challenge_id = p.challenge_id
      WHERE p.user_id = $1 AND p.status = 'ACTIVE'
      ORDER BY p.joined_at DESC`,
    [userId]
  );
  if (participations.length === 0) return [];

  const todayKst = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const isoDow = new Date(`${todayKst}T00:00:00Z`).getUTCDay() || 7;
  const mondayStr = addDaysStr(todayKst, -(isoDow - 1));

  const results: ChallengeWeeklyProgress[] = [];
  for (const p of participations) {
    const { rows: dayRows } = await pool.query<{ day: string | Date; total: string }>(
      `SELECT (occurred_at AT TIME ZONE 'Asia/Seoul')::date AS day, SUM(increment_value) AS total
         FROM challenge.challenge_progress_events
        WHERE participation_id = $1
          AND (occurred_at AT TIME ZONE 'Asia/Seoul')::date >= $2::date
          AND (occurred_at AT TIME ZONE 'Asia/Seoul')::date < $2::date + 7
        GROUP BY day`,
      [p.participation_id, mondayStr]
    );
    const byDay = new Map(dayRows.map((r) => [toDateStr(r.day), Number(r.total ?? 0)]));
    const days = DAY_LABELS.map((dayLabel, i) => {
      const dateStr = addDaysStr(mondayStr, i);
      return { dayLabel, value: byDay.get(dateStr) ?? 0, isToday: dateStr === todayKst };
    });
    results.push({
      challengeId: p.challenge_id,
      name: p.name,
      metricType: p.metric_type,
      progressRatio: Number(p.progress_ratio),
      days
    });
  }
  return results;
}

function todayKstStr(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

export async function joinPublicChallenge(
  challengeId: string,
  userId: string
): Promise<'ok' | 'not-found' | 'already-joined' | 'not-open-yet'> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT challenge_type, visibility, status, start_at FROM challenge.challenges WHERE challenge_id = $1`,
    [challengeId]
  );
  const challenge = rows[0];
  if (!challenge || challenge.challenge_type !== 'PUBLIC' || challenge.visibility !== 'PUBLIC' || challenge.status !== 'ACTIVE') {
    return 'not-found';
  }

  // 신청은 시작일 바로 전날(KST)에만 가능하다 — 너무 일찍 몰려서 신청하거나
  // 이미 시작된 챌린지에 뒤늦게 신청해 진행률 계산이 꼬이는 것을 막는다.
  const startDateKst = toDateStr(challenge.start_at);
  const openDateKst = addDaysStr(startDateKst, -1);
  if (todayKstStr() !== openDateKst) return 'not-open-yet';

  const existing = await pool.query(
    `SELECT 1 FROM challenge.challenge_participations WHERE challenge_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [challengeId, userId]
  );
  if (existing.rows.length > 0) return 'already-joined';

  await pool.query(
    `INSERT INTO challenge.challenge_participations (challenge_id, user_id, status, progress_value, progress_ratio)
     VALUES ($1, $2, 'ACTIVE', 0, 0)`,
    [challengeId, userId]
  );
  return 'ok';
}

export type ChallengeRuleInput = {
  minDistanceM?: number;
  maxDistanceM?: number;
  minPaceSecPerKm?: number;
  maxPaceSecPerKm?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  minAvgHeartRate?: number;
  maxAvgHeartRate?: number;
  minAvgCadence?: number;
  minElevationGainM?: number;
  allowedSourceTypes?: string[];
};

export type CreateChallengeInput = {
  challengeType: 'PERSONAL' | 'PUBLIC';
  name: string;
  description: string | null;
  metricType: MetricType;
  targetValue: number;
  startAt: string;
  endAt: string;
  rules: ChallengeRuleInput | null;
};

export class ChallengeValidationError extends Error {}

const RULE_FIELD_MAP: [keyof ChallengeRuleInput, string][] = [
  ['minDistanceM', 'min_distance_m'],
  ['maxDistanceM', 'max_distance_m'],
  ['minPaceSecPerKm', 'min_pace_sec_per_km'],
  ['maxPaceSecPerKm', 'max_pace_sec_per_km'],
  ['minDurationSec', 'min_duration_sec'],
  ['maxDurationSec', 'max_duration_sec'],
  ['minAvgHeartRate', 'min_avg_heart_rate'],
  ['maxAvgHeartRate', 'max_avg_heart_rate'],
  ['minAvgCadence', 'min_avg_cadence'],
  ['minElevationGainM', 'min_elevation_gain_m']
];

// "챌린지 만들기" — PERSONAL/PUBLIC 공통. 세부 조건(challenge_rules)은 선택이지만, 사용하기로
// 했다면(rules !== null) 최소 하나의 필드는 채워져 있어야 한다(빈 규칙 행을 만들지 않기 위함).
// PERSONAL은 만든 사람이 곧 유일한 참가자이므로 생성과 동시에 참가 처리한다. PUBLIC은 다른
// 사용자와 동일하게 시작일 전날에만 "참여하기"로 신청하게 한다(자기 챌린지라고 예외를 두지 않음).
export async function createChallenge(creatorUserId: string, input: CreateChallengeInput): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new ChallengeValidationError('챌린지 이름을 입력해 주세요.');
  if (name.length > 150) throw new ChallengeValidationError('챌린지 이름은 150자 이내로 입력해 주세요.');
  if (!(input.targetValue > 0)) throw new ChallengeValidationError('목표값은 0보다 커야 해요.');
  if (!(new Date(input.startAt) < new Date(input.endAt))) {
    throw new ChallengeValidationError('종료일은 시작일보다 늦어야 해요.');
  }
  if (input.startAt < todayKstStr()) {
    throw new ChallengeValidationError('시작일은 오늘 이후여야 해요.');
  }

  const ruleEntries = input.rules
    ? RULE_FIELD_MAP.filter(([key]) => input.rules![key] !== undefined && input.rules![key] !== null)
    : [];
  const hasSourceTypes = !!input.rules?.allowedSourceTypes?.length;
  if (input.rules && ruleEntries.length === 0 && !hasSourceTypes) {
    throw new ChallengeValidationError('세부 조건을 사용하려면 최소 한 가지 항목은 채워야 해요.');
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const visibility = input.challengeType === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE';
    const { rows } = await client.query(
      `INSERT INTO challenge.challenges
         (creator_user_id, challenge_type, name, description, metric_type, target_value, start_at, end_at, visibility, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE')
       RETURNING challenge_id`,
      [
        creatorUserId,
        input.challengeType,
        name,
        input.description?.trim() || null,
        input.metricType,
        input.targetValue,
        input.startAt,
        input.endAt,
        visibility
      ]
    );
    const challengeId = rows[0].challenge_id as string;

    if (ruleEntries.length > 0 || hasSourceTypes) {
      const columns = ruleEntries.map(([, column]) => column);
      const values: (number | string[] | null | undefined)[] = ruleEntries.map(([key]) => input.rules![key]);
      columns.push('allowed_source_types');
      values.push(hasSourceTypes ? input.rules!.allowedSourceTypes : null);

      const placeholders = values.map((_, i) => `$${i + 2}`).join(', ');
      await client.query(
        `INSERT INTO challenge.challenge_rules (challenge_id, ${columns.join(', ')})
         VALUES ($1, ${placeholders})`,
        [challengeId, ...values]
      );
    }

    if (input.challengeType === 'PERSONAL') {
      await client.query(
        `INSERT INTO challenge.challenge_participations (challenge_id, user_id, status, progress_value, progress_ratio)
         VALUES ($1, $2, 'ACTIVE', 0, 0)`,
        [challengeId, creatorUserId]
      );
    }

    await client.query('COMMIT');
    return challengeId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
