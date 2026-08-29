import { getPool } from './db.js';
import { addCrewChatMessage } from './crewChat.js';
import { publishBattleDeclinedEvent, publishBattleStartedEvent } from './messaging.js';

export type BattleMetricType = 'DISTANCE' | 'PACE';

// 이 모듈의 모든 "오늘/날짜" 계산은 Asia/Seoul 기준으로 통일한다(서버 타임존과 무관하게).
function todayKstDateString(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // sv-SE 로케일은 YYYY-MM-DD 포맷
}

// 배틀 응답 마감 시각도 채팅 시간과 마찬가지로 서버가 KST로 미리 계산해서 내려준다 —
// 프론트에서 타임존 변환을 다시 하지 않는다.
const KST_DEADLINE_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function toKstDeadlineLabel(date: Date): string {
  const parts = Object.fromEntries(KST_DEADLINE_FMT.formatToParts(date).map((p) => [p.type, p.value])) as Record<string, string>;
  return `${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

// dateStr은 이미 KST 기준으로 뽑아낸 순수 캘린더 날짜 문자열이므로, 여기서는 타임존 변환 없이
// UTC 자정 기준으로만 날짜를 더한다(+09:00으로 파싱해서 toISOString()으로 되돌리면 UTC 자정이
// 아니라 UTC 15:00에 걸쳐 하루가 밀리면서 날짜가 아예 전진하지 않는 무한루프 버그가 생겼었다).
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// pg 드라이버는 DATE 컬럼을 JS Date 객체로 돌려주기 때문에(문자열이 아님), 이 모듈 전체가
// 'YYYY-MM-DD' 문자열 기준으로 날짜 산술을 하려면 크루 배틀 행을 읽자마자 문자열로 통일해야 한다.
function toDateStr(value: string | Date): string {
  if (typeof value === 'string') return value;
  return value.toISOString().slice(0, 10);
}

async function getActiveMemberCount(crewId: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT COUNT(*) FROM crew.crew_members WHERE crew_id = $1 AND status = 'ACTIVE'`, [crewId]);
  return Number(rows[0].count);
}

// 오늘 크루원 평균 km. 뛰지 않은 멤버도 분모에 포함해 "팀 평균"으로 계산한다.
export async function getCrewAvgKmForDate(crewId: string, dateStr: string): Promise<{ avgKm: number; memberCount: number }> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
        (SELECT COUNT(*) FROM crew.crew_members WHERE crew_id = $1 AND status = 'ACTIVE') AS member_count,
        COALESCE(SUM(r.distance_m), 0) AS total_distance_m
       FROM running_record.runs r
       JOIN crew.crew_members m ON m.user_id = r.user_id AND m.crew_id = $1 AND m.status = 'ACTIVE'
      WHERE r.status = 'COMPLETED'
        AND (r.started_at AT TIME ZONE 'Asia/Seoul')::date = $2::date`,
    [crewId, dateStr]
  );
  const memberCount = Number(rows[0].member_count);
  const totalDistanceM = Number(rows[0].total_distance_m);
  return { avgKm: memberCount > 0 ? totalDistanceM / 1000 / memberCount : 0, memberCount };
}

// 오늘 뛴 멤버들의 평균 페이스(분/km). 아무도 안 뛰었으면 null.
export async function getCrewAvgPaceForDate(crewId: string, dateStr: string): Promise<{ avgPaceMinPerKm: number; runnerCount: number } | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT AVG(r.average_pace_sec_per_km) AS avg_pace_sec, COUNT(*) AS runner_count
       FROM running_record.runs r
       JOIN crew.crew_members m ON m.user_id = r.user_id AND m.crew_id = $1 AND m.status = 'ACTIVE'
      WHERE r.status = 'COMPLETED'
        AND (r.started_at AT TIME ZONE 'Asia/Seoul')::date = $2::date`,
    [crewId, dateStr]
  );
  if (rows[0].avg_pace_sec === null) return null;
  return { avgPaceMinPerKm: Number(rows[0].avg_pace_sec) / 60, runnerCount: Number(rows[0].runner_count) };
}

function truncate1(value: number): number {
  return Math.floor(value * 10) / 10;
}

// ---- 배틀 상대 추천 ----

export type BattleCandidate = {
  crewId: string;
  crewName: string;
  memberCount: number;
  statValue: number; // km: 오늘 평균 km, pace: 오늘 평균 페이스(분/km)
  tier: number; // 0 = 정확히 같은 값, 1 이상 = 그만큼 넓혀서 찾은 후보
};

// km 배틀: 내 크루 평균 km과 가까운 크루부터(나보다 조금 높은 쪽을 우선), 페이스 배틀도 마찬가지로
// 나와 가까운 크루부터 정렬한다. 예전엔 "나보다 못한 크루는 추천에서 아예 제외"하는 편도 필터가
// 있었는데, 크루 수가 적은 지금 같은 상황에서 내 크루가 제일 잘하는 쪽이면(예: 전체 1등) 그보다
// 잘하는 크루가 없어서 후보가 통째로 비어버리는 문제가 있었다. 배틀 상대가 아예 없는 것보다
// "나보다 약한 크루라도 상대해주는" 게 나으므로, tier가 음수(나보다 약함)인 크루도 후보에는
// 포함하되 정렬 우선순위만 뒤로 보낸다 — 배틀 진행 중(PROPOSED/ACTIVE)인 크루만 제외한다.
export async function getBattleCandidates(crewId: string, metricType: BattleMetricType): Promise<BattleCandidate[]> {
  const pool = getPool();

  const { rows: myRows } = await pool.query(
    `SELECT avg_weekly_distance_m, avg_weekly_pace_sec_per_km FROM crew.crews WHERE crew_id = $1`,
    [crewId]
  );
  const my = myRows[0];
  if (!my) return [];

  // 내 크루의 이번 주 평균이 아직 없으면(막 만든 크루 등) 추천 자체를 통째로 비워버리지 않고
  // 0을 기준으로 삼는다 — 그래야 다른 크루가 하나라도 있으면 최소 한 팀은 추천에 뜬다.
  let myTarget = 0;
  if (metricType === 'DISTANCE') {
    if (my.avg_weekly_distance_m !== null) myTarget = Math.floor(Number(my.avg_weekly_distance_m) / 1000);
  } else if (my.avg_weekly_pace_sec_per_km !== null) {
    myTarget = truncate1(Number(my.avg_weekly_pace_sec_per_km) / 60);
  }

  const { rows: crews } = await pool.query(
    `SELECT c.crew_id, c.crew_name, c.avg_weekly_distance_m, c.avg_weekly_pace_sec_per_km,
            (SELECT COUNT(*) FROM crew.crew_members m WHERE m.crew_id = c.crew_id AND m.status = 'ACTIVE') AS member_count
       FROM crew.crews c
      WHERE c.crew_id <> $1
        AND NOT EXISTS (
          SELECT 1 FROM crew.crew_battles b
           WHERE b.status IN ('PROPOSED', 'ACTIVE') AND (b.crew_a_id = c.crew_id OR b.crew_b_id = c.crew_id)
        )`,
    [crewId]
  );

  const candidates: BattleCandidate[] = [];
  for (const row of crews) {
    if (Number(row.member_count) === 0) continue;
    if (metricType === 'DISTANCE') {
      if (row.avg_weekly_distance_m === null) continue;
      const avgKm = Number(row.avg_weekly_distance_m) / 1000;
      const tierValue = Math.floor(avgKm);
      const tier = tierValue - myTarget;
      candidates.push({ crewId: row.crew_id, crewName: row.crew_name, memberCount: Number(row.member_count), statValue: Math.round(avgKm * 100) / 100, tier });
    } else {
      if (row.avg_weekly_pace_sec_per_km === null) continue;
      const avgPaceMin = Number(row.avg_weekly_pace_sec_per_km) / 60;
      const tierValue = truncate1(avgPaceMin);
      const tier = Math.round((myTarget - tierValue) * 10) / 10;
      candidates.push({ crewId: row.crew_id, crewName: row.crew_name, memberCount: Number(row.member_count), statValue: Math.round(avgPaceMin * 100) / 100, tier });
    }
  }

  // 나보다 잘하는(tier>=0) 크루를 우선하되, 그런 크루가 없으면 나보다 약한 크루도 (tier가 0에
  // 가까운 순으로) 자연스럽게 이어서 뜬다 — abs(tier) 기준 정렬 + 동률이면 나보다 잘하는 쪽 우선.
  candidates.sort((a, b) => {
    const distA = Math.abs(a.tier);
    const distB = Math.abs(b.tier);
    if (distA !== distB) return distA - distB;
    if ((a.tier >= 0) !== (b.tier >= 0)) return a.tier >= 0 ? -1 : 1;
    return a.crewName.localeCompare(b.crewName);
  });
  return candidates;
}

export async function getActiveOrPendingBattleForCrew(crewId: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM crew.crew_battles WHERE (crew_a_id = $1 OR crew_b_id = $1) AND status IN ('PROPOSED', 'PENDING_OPPONENT', 'ACTIVE') ORDER BY created_at DESC LIMIT 1`,
    [crewId]
  );
  return rows[0] ?? null;
}

const OPPONENT_RESPONSE_WINDOW_HOURS = 24;

export async function proposeBattle(
  crewId: string,
  opponentCrewId: string,
  metricType: BattleMetricType,
  proposerUserId: string
): Promise<{ battleId: string } | 'already-in-battle' | 'opponent-unavailable'> {
  const pool = getPool();
  if (await getActiveOrPendingBattleForCrew(crewId)) return 'already-in-battle';
  if (await getActiveOrPendingBattleForCrew(opponentCrewId)) return 'opponent-unavailable';

  const { rows } = await pool.query(
    `INSERT INTO crew.crew_battles (metric_type, crew_a_id, crew_b_id, proposed_by_user_id, status)
     VALUES ($1, $2, $3, $4, 'PROPOSED') RETURNING battle_id`,
    [metricType, crewId, opponentCrewId, proposerUserId]
  );
  const battleId = rows[0].battle_id as string;
  await pool.query(`INSERT INTO crew.crew_battle_votes (battle_id, user_id, vote) VALUES ($1, $2, 'AGREE')`, [battleId, proposerUserId]);

  // 크루장이 직접 신청한 거라면 우리 크루 내부 승인 단계(자기 자신에게 다시 투표를 받는 것)를
  // 건너뛰고 곧바로 상대 크루의 응답 대기 단계로 넘어간다. (예전엔 크루장이 신청해도 항상
  // PROPOSED로 남아서, 신청한 크루장이 곧바로 다시 "승인"을 눌러야 하는 불필요한 절차가 있었다.)
  const { rows: ownerRows } = await pool.query(`SELECT owner_user_id FROM crew.crews WHERE crew_id = $1`, [crewId]);
  if (ownerRows[0]?.owner_user_id === proposerUserId) {
    await resolveBattle(battleId, true);
  }

  return { battleId };
}

async function announceOnce(crewId: string, battleId: string, eventKey: string, message: string) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `INSERT INTO crew.crew_battle_chat_events (battle_id, event_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [battleId, eventKey]
  );
  if (!rowCount) return; // 이미 공지된 이벤트라 조용히 건너뛴다(폴링 중복 방지)
  await addCrewChatMessage(crewId, 'system', '배틀 알림', message);
}

const METRIC_LABEL: Record<BattleMetricType, string> = { DISTANCE: '거리', PACE: '페이스' };

// 배틀은 두 단계를 거친다.
//   1) PROPOSED: 제안한 크루(crew_a) 내부 승인 단계 — 크루장이 직접 신청했으면 즉시 통과.
//   2) PENDING_OPPONENT: 상대 크루(crew_b) 응답 대기 단계 — 24시간 안에 크루장 승인 또는
//      과반수 찬성이 있어야 실제로 시작된다. 이 시간 안에 응답이 없거나 거절되면 DECLINED로
//      끝나고, 제안한 크루의 크루장에게 알림(notification-service)과 채팅 공지가 간다.
// resolveBattle은 배틀의 "현재 상태"를 보고 어느 단계인지 스스로 판단해서 다음 단계로 넘긴다.
export async function resolveBattle(battleId: string, approve: boolean): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM crew.crew_battles WHERE battle_id = $1 AND status IN ('PROPOSED', 'PENDING_OPPONENT')`,
    [battleId]
  );
  const battle = rows[0];
  if (!battle) return false;

  const { rows: nameRows } = await pool.query(`SELECT crew_id, crew_name FROM crew.crews WHERE crew_id IN ($1, $2)`, [
    battle.crew_a_id,
    battle.crew_b_id
  ]);
  const crewAName = nameRows.find((r) => r.crew_id === battle.crew_a_id)?.crew_name ?? '우리 크루';
  const crewBName = nameRows.find((r) => r.crew_id === battle.crew_b_id)?.crew_name ?? '상대 크루';
  const metricLabel = METRIC_LABEL[battle.metric_type as BattleMetricType];

  if (battle.status === 'PROPOSED') {
    if (approve) {
      const expiresAt = new Date(Date.now() + OPPONENT_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000);
      await pool.query(`UPDATE crew.crew_battles SET status = 'PENDING_OPPONENT', expires_at = $2 WHERE battle_id = $1`, [
        battleId,
        expiresAt
      ]);
      await announceOnce(battle.crew_a_id, battleId, 'SENT_TO_OPPONENT', `${crewBName} 크루에 ${metricLabel} 배틀을 신청했어요. 24시간 안에 응답을 기다려요!`);
      await announceOnce(battle.crew_b_id, battleId, 'RECEIVED_PROPOSAL', `${crewAName} 크루가 ${metricLabel} 배틀을 신청했어요! 24시간 안에 크루장 승인 또는 크루원 과반수 찬성이 필요해요.`);
    } else {
      await pool.query(`UPDATE crew.crew_battles SET status = 'CANCELLED', resolved_at = now() WHERE battle_id = $1`, [battleId]);
      await announceOnce(battle.crew_a_id, battleId, 'CANCELLED_BEFORE_SEND', `이번 ${crewBName} 크루와의 배틀 제안은 다음 기회에 도전해봐요.`);
    }
  } else {
    // PENDING_OPPONENT
    if (approve) {
      await pool.query(
        `UPDATE crew.crew_battles SET status = 'ACTIVE', start_date = CURRENT_DATE, end_date = CURRENT_DATE + 6, resolved_at = now(), expires_at = NULL WHERE battle_id = $1`,
        [battleId]
      );
      await announceOnce(battle.crew_a_id, battleId, 'STARTED', `${crewBName} 크루와의 ${metricLabel} 배틀이 시작되었어요. 1주일간 힘내봐요!`);
      await announceOnce(battle.crew_b_id, battleId, 'STARTED', `${crewAName} 크루와의 ${metricLabel} 배틀이 시작되었어요. 1주일간 힘내봐요!`);
      await notifyBattleStarted(battle, crewAName, crewBName, metricLabel);
    } else {
      await pool.query(`UPDATE crew.crew_battles SET status = 'DECLINED', resolved_at = now(), expires_at = NULL WHERE battle_id = $1`, [
        battleId
      ]);
      await announceOnce(battle.crew_b_id, battleId, 'DECLINED_BY_US', `${crewAName} 크루의 배틀 제안을 거절했어요.`);
      await announceOnce(battle.crew_a_id, battleId, 'DECLINED_BY_OPPONENT', `${crewBName} 크루가 이번 배틀 제안을 거절했어요. 다른 크루에게 다시 도전해봐요!`);
      await notifyBattleDeclined(battle, crewBName);
    }
  }

  // 이 단계의 투표는 끝났으니(승인/거절 어느 쪽이든) 다음 단계에서 새로 투표를 받는다.
  await pool.query(`DELETE FROM crew.crew_battle_votes WHERE battle_id = $1`, [battleId]);

  return true;
}

// 상대 크루가 거절했거나(명시적 거절) 24시간 안에 응답이 없어 자동 거절된 경우, 배틀을 제안한
// 크루의 크루장에게 알림을 보낸다. crew-service가 notification.notifications를 직접 쓰지 않고
// (서비스 경계) crew.join-request-events 토픽으로 이미 흘려보내는 것과 같은 방식으로,
// crew-notification-consumer가 구독해서 알림 테이블에 반영한다.
async function notifyBattleDeclined(battle: { battle_id: string; crew_a_id: string; metric_type: string }, opponentCrewName: string) {
  const pool = getPool();
  const { rows: ownerRows } = await pool.query(`SELECT owner_user_id FROM crew.crews WHERE crew_id = $1`, [battle.crew_a_id]);
  const leaderUserId = ownerRows[0]?.owner_user_id;
  if (!leaderUserId) return;
  const metricLabel = METRIC_LABEL[battle.metric_type as BattleMetricType];
  await publishBattleDeclinedEvent({
    battleId: battle.battle_id,
    leaderUserId,
    opponentCrewName,
    metricLabel
  });
}

async function getActiveMemberUserIds(crewId: string): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT user_id FROM crew.crew_members WHERE crew_id = $1 AND status = 'ACTIVE'`, [crewId]);
  return rows.map((row) => row.user_id);
}

// 배틀이 ACTIVE로 전환된(=시작된) 양쪽 크루 전원에게 알림을 보낸다. 다른 알림 이벤트
// (JoinRequestSubmitted, BattleDeclined 등)와 같은 "이벤트 1건 = 알림 대상 1명" 단위를 그대로
// 따른다 — 크루원 수만큼 이벤트가 늘어나지만, 각 이벤트가 독립된 eventId를 가져야
// notification.notifications의 source_event_id UNIQUE 제약과 자연스럽게 맞물려 멱등하게
// 적재된다(이벤트 1건에 대상 여러 명을 배열로 담으면 컨슈머 쪽에서 같은 eventId로 여러 행을
// 넣으려다 이 제약에 걸려 두 번째 사람부터 조용히 유실된다).
async function notifyBattleStarted(
  battle: { battle_id: string; crew_a_id: string; crew_b_id: string },
  crewAName: string,
  crewBName: string,
  metricLabel: string
) {
  const [crewAMemberUserIds, crewBMemberUserIds] = await Promise.all([
    getActiveMemberUserIds(battle.crew_a_id),
    getActiveMemberUserIds(battle.crew_b_id)
  ]);
  const targets = [
    ...crewAMemberUserIds.map((userId) => ({ userId, opponentCrewName: crewBName })),
    ...crewBMemberUserIds.map((userId) => ({ userId, opponentCrewName: crewAName }))
  ];
  await Promise.all(
    targets.map((target) =>
      publishBattleStartedEvent({
        battleId: battle.battle_id,
        userId: target.userId,
        opponentCrewName: target.opponentCrewName,
        metricLabel
      })
    )
  );
}

export type VoteTally = { agree: number; disagree: number; total: number };

// 크루원이 찬성/반대 투표를 한다. 과반수(전체 ACTIVE 멤버 기준)에 도달하면 자동으로 승인/거절 처리한다.
// 배틀이 어느 단계인지(PROPOSED=우리 크루 내부 승인 / PENDING_OPPONENT=상대 크루 응답)에 따라
// 투표 자격을 확인할 크루가 달라진다.
export async function castVote(battleId: string, userId: string, vote: 'AGREE' | 'DISAGREE'): Promise<VoteTally | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM crew.crew_battles WHERE battle_id = $1 AND status IN ('PROPOSED', 'PENDING_OPPONENT')`,
    [battleId]
  );
  const battle = rows[0];
  if (!battle) return null;
  await autoDeclineIfExpired(battle);
  if (battle.status === 'DECLINED') return null;

  const actingCrewId = battle.status === 'PROPOSED' ? battle.crew_a_id : battle.crew_b_id;
  const isMember = await pool.query(`SELECT 1 FROM crew.crew_members WHERE crew_id = $1 AND user_id = $2 AND status = 'ACTIVE'`, [
    actingCrewId,
    userId
  ]);
  if (isMember.rows.length === 0) return null;

  await pool.query(
    `INSERT INTO crew.crew_battle_votes (battle_id, user_id, vote) VALUES ($1, $2, $3)
     ON CONFLICT (battle_id, user_id) DO UPDATE SET vote = EXCLUDED.vote, voted_at = now()`,
    [battleId, userId, vote]
  );

  const total = await getActiveMemberCount(actingCrewId);
  const { rows: tallyRows } = await pool.query(`SELECT vote, COUNT(*) AS c FROM crew.crew_battle_votes WHERE battle_id = $1 GROUP BY vote`, [
    battleId
  ]);
  const agree = Number(tallyRows.find((r) => r.vote === 'AGREE')?.c ?? 0);
  const disagree = Number(tallyRows.find((r) => r.vote === 'DISAGREE')?.c ?? 0);

  if (agree > total / 2) await resolveBattle(battleId, true);
  else if (disagree > total / 2) await resolveBattle(battleId, false);

  return { agree, disagree, total };
}

// 크루장이 크루원 동의 없이도 바로 결정할 수 있다(우리 크루 내부 승인 단계든, 상대 크루 응답
// 단계든 그 시점에 해당하는 크루의 크루장만 결정할 수 있다).
export async function leaderDecide(battleId: string, leaderUserId: string, approve: boolean): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM crew.crew_battles WHERE battle_id = $1 AND status IN ('PROPOSED', 'PENDING_OPPONENT')`,
    [battleId]
  );
  const battle = rows[0];
  if (!battle) return false;
  await autoDeclineIfExpired(battle);
  if (battle.status === 'DECLINED') return false;

  const actingCrewId = battle.status === 'PROPOSED' ? battle.crew_a_id : battle.crew_b_id;
  const { rows: ownerRows } = await pool.query(`SELECT owner_user_id FROM crew.crews WHERE crew_id = $1`, [actingCrewId]);
  if (ownerRows[0]?.owner_user_id !== leaderUserId) return false;
  return resolveBattle(battleId, approve);
}

// 상대 크루의 24시간 응답 기한이 지났으면 자동으로 거절 처리한다(응답 지연도 거절로 취급).
// getPendingBattleView/castVote/leaderDecide가 배틀을 조회할 때마다 게으르게 확인한다 —
// getBattleView가 배틀 종료(COMPLETED) 전환을 게으르게 처리하는 것과 같은 방식이다.
async function autoDeclineIfExpired(battle: { battle_id: string; status: string; expires_at: string | Date | null }): Promise<void> {
  if (battle.status !== 'PENDING_OPPONENT' || !battle.expires_at) return;
  const expiresAt = typeof battle.expires_at === 'string' ? new Date(battle.expires_at) : battle.expires_at;
  if (new Date() <= expiresAt) return;
  await resolveBattle(battle.battle_id, false);
  battle.status = 'DECLINED';
}

// autoDeclineIfExpired는 누군가 그 배틀을 조회할 때만 게으르게 동작하므로, 아무도 크루
// 페이지를 열지 않으면 24시간이 지나도 거절 처리(크루 채팅 공지 + notification 발행)가
// 한참 뒤로 미뤄질 수 있다. index.ts에서 주기적으로 이 함수를 호출해 응답 기한이 지난
// PENDING_OPPONENT 배틀을 능동적으로 정리한다 — resolveBattle을 그대로 재사용하므로
// 크루 채팅 공지·notification 발행 로직은 완전히 동일하게 탄다.
export async function sweepExpiredBattles(): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT battle_id FROM crew.crew_battles WHERE status = 'PENDING_OPPONENT' AND expires_at IS NOT NULL AND expires_at < now()`
  );
  for (const { battle_id: battleId } of rows) {
    try {
      await resolveBattle(battleId, false);
    } catch (err) {
      console.error(`[crew-service] sweepExpiredBattles battle=${battleId} 실패:`, err);
    }
  }
}

export type PendingBattleView = {
  battleId: string;
  metricType: BattleMetricType;
  opponentCrewId: string;
  opponentCrewName: string;
  description: string;
  tally: VoteTally;
  myVote: 'AGREE' | 'DISAGREE' | null;
  isLeader: boolean;
  awaitingOpponentResponse: boolean;
  expiresAt: string | null;
  expiresAtLabel: string | null;
};

// 지금 이 크루가 응답할 차례인 배틀 제안을 조회한다 — 우리 크루가 제안한 쪽(crew_a, PROPOSED
// 단계)이거나, 우리 크루가 제안받은 쪽(crew_b, PENDING_OPPONENT 단계)이거나 둘 다 해당될 수 있다.
export async function getPendingBattleView(crewId: string, userId: string): Promise<PendingBattleView | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM crew.crew_battles
      WHERE (crew_a_id = $1 AND status = 'PROPOSED') OR (crew_b_id = $1 AND status = 'PENDING_OPPONENT')
      ORDER BY created_at DESC LIMIT 1`,
    [crewId]
  );
  const battle = rows[0];
  if (!battle) return null;
  await autoDeclineIfExpired(battle);
  if (battle.status === 'DECLINED') return null;

  const isCrewA = battle.crew_a_id === crewId;
  const opponentCrewId = isCrewA ? battle.crew_b_id : battle.crew_a_id;
  const { rows: nameRows } = await pool.query(`SELECT crew_id, crew_name FROM crew.crews WHERE crew_id IN ($1, $2)`, [crewId, opponentCrewId]);
  const opponentName = nameRows.find((r) => r.crew_id === opponentCrewId)?.crew_name ?? '상대 크루';

  const total = await getActiveMemberCount(crewId);
  const { rows: tallyRows } = await pool.query(`SELECT vote, COUNT(*) AS c FROM crew.crew_battle_votes WHERE battle_id = $1 GROUP BY vote`, [
    battle.battle_id
  ]);
  const agree = Number(tallyRows.find((r) => r.vote === 'AGREE')?.c ?? 0);
  const disagree = Number(tallyRows.find((r) => r.vote === 'DISAGREE')?.c ?? 0);

  const { rows: myVoteRows } = await pool.query(`SELECT vote FROM crew.crew_battle_votes WHERE battle_id = $1 AND user_id = $2`, [
    battle.battle_id,
    userId
  ]);

  const { rows: ownerRows } = await pool.query(`SELECT owner_user_id FROM crew.crews WHERE crew_id = $1`, [crewId]);

  const metricLabel = METRIC_LABEL[battle.metric_type as BattleMetricType];
  const awaitingOpponentResponse = !isCrewA; // 우리가 crew_b라면 지금 우리 크루가 응답할 차례.
  return {
    battleId: battle.battle_id,
    metricType: battle.metric_type,
    opponentCrewId,
    opponentCrewName: opponentName,
    description: awaitingOpponentResponse
      ? `${opponentName} 크루가 1주일간 ${metricLabel} 배틀을 신청했어요. 응답해주세요!`
      : `${opponentName} 크루와 1주일간 ${metricLabel} 배틀에 참여하시겠습니까?`,
    awaitingOpponentResponse,
    expiresAt: battle.expires_at ? new Date(battle.expires_at).toISOString() : null,
    expiresAtLabel: battle.expires_at ? toKstDeadlineLabel(new Date(battle.expires_at)) : null,
    tally: { agree, disagree, total },
    myVote: (myVoteRows[0]?.vote as 'AGREE' | 'DISAGREE') ?? null,
    isLeader: ownerRows[0]?.owner_user_id === userId
  };
}

export type CrewBattleInfo = {
  crewId: string;
  crewName: string;
  memberCount: number;
  rank: number | null;
  rankTotal: number;
  statValue: number | null;
  winCount: number;
};

// 배틀 배지가 달린 크루명에 마우스를 올리거나 클릭했을 때 보여줄 정보(랭킹/승수).
export async function getCrewBattleInfo(crewId: string, metricType: BattleMetricType): Promise<CrewBattleInfo | null> {
  const pool = getPool();
  const { rows: crewRows } = await pool.query(
    `SELECT crew_id, crew_name, (SELECT COUNT(*) FROM crew.crew_members m WHERE m.crew_id = c.crew_id AND m.status = 'ACTIVE') AS member_count
       FROM crew.crews c WHERE c.crew_id = $1`,
    [crewId]
  );
  if (crewRows.length === 0) return null;

  const today = todayKstDateString();
  const { rows: allCrews } = await pool.query(
    `SELECT c.crew_id FROM crew.crews c WHERE (SELECT COUNT(*) FROM crew.crew_members m WHERE m.crew_id = c.crew_id AND m.status = 'ACTIVE') > 0`
  );
  const ranked: { crewId: string; value: number }[] = [];
  for (const row of allCrews) {
    if (metricType === 'DISTANCE') {
      const { avgKm } = await getCrewAvgKmForDate(row.crew_id, today);
      ranked.push({ crewId: row.crew_id, value: avgKm });
    } else {
      const paceStat = await getCrewAvgPaceForDate(row.crew_id, today);
      if (paceStat) ranked.push({ crewId: row.crew_id, value: paceStat.avgPaceMinPerKm });
    }
  }
  ranked.sort((a, b) => (metricType === 'DISTANCE' ? b.value - a.value : a.value - b.value));
  const rankIndex = ranked.findIndex((r) => r.crewId === crewId);

  const { rows: winRows } = await pool.query(`SELECT COUNT(*) FROM crew.crew_battles WHERE winner_crew_id = $1`, [crewId]);

  return {
    crewId,
    crewName: crewRows[0].crew_name,
    memberCount: Number(crewRows[0].member_count),
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    rankTotal: ranked.length,
    statValue: rankIndex >= 0 ? Math.round(ranked[rankIndex].value * 100) / 100 : null,
    winCount: Number(winRows[0].count)
  };
}

export type DayResult = 'WIN' | 'LOSE' | 'DRAW' | null;

export type BattleDay = { date: string; crewAValue: number | null; crewBValue: number | null; crewAResult: DayResult; isToday: boolean; isFuture: boolean };

export type ActiveBattleView = {
  battleId: string;
  metricType: BattleMetricType;
  myCrewId: string;
  myCrewName: string;
  opponentCrewId: string;
  opponentCrewName: string;
  days: BattleDay[];
  myWins: number;
  opponentWins: number;
  draws: number;
  showFinalBanner: boolean;
  finalResult: 'WIN' | 'LOSE' | 'DRAW' | null;
  isLeader: boolean;
};

// 크루 A 관점의 승/무/패로 뒤집는다 — "내(myCrewId) 관점" 결과를 그대로 crewAResult에 쓰면
// 내가 crew_b일 때 뜻이 반대가 된다(내가 이겼으면 crew_a는 진 것).
function flipForCrewA(myResult: DayResult, isA: boolean): DayResult {
  if (isA || myResult === null || myResult === 'DRAW') return myResult;
  return myResult === 'WIN' ? 'LOSE' : 'WIN';
}

async function metricValueForDay(crewId: string, metricType: BattleMetricType, dateStr: string): Promise<number | null> {
  if (metricType === 'DISTANCE') {
    const { avgKm } = await getCrewAvgKmForDate(crewId, dateStr);
    return Math.floor(avgKm * 100) / 100;
  }
  const paceStat = await getCrewAvgPaceForDate(crewId, dateStr);
  return paceStat ? Math.floor(paceStat.avgPaceMinPerKm * 100) / 100 : null;
}

// 진행 중이거나 어제 막 끝난(그래서 오늘 하루 결과 배너를 보여줘야 하는) 배틀을 크루 관점에서 조회한다.
// 끝난 지 하루가 지나면(오늘 > 종료일+1) null을 반환해 추천 패널이 다시 뜨게 한다.
export async function getBattleView(crewId: string, userId: string): Promise<ActiveBattleView | null> {
  const pool = getPool();
  const today = todayKstDateString();
  const { rows } = await pool.query(
    `SELECT * FROM crew.crew_battles WHERE (crew_a_id = $1 OR crew_b_id = $1) AND status IN ('ACTIVE', 'COMPLETED') ORDER BY created_at DESC LIMIT 1`,
    [crewId]
  );
  const battle = rows[0];
  if (!battle) return null;
  battle.start_date = toDateStr(battle.start_date);
  battle.end_date = toDateStr(battle.end_date);
  if (today > addDays(battle.end_date, 1)) return null; // 종료 배너 노출 기간(다음날 하루)까지 지남

  const isA = battle.crew_a_id === crewId;
  const myCrewId = crewId;
  const opponentCrewId = isA ? battle.crew_b_id : battle.crew_a_id;
  const { rows: nameRows } = await pool.query(`SELECT crew_id, crew_name FROM crew.crews WHERE crew_id IN ($1, $2)`, [
    myCrewId,
    opponentCrewId
  ]);
  const myCrewName = nameRows.find((r) => r.crew_id === myCrewId)?.crew_name ?? '';
  const opponentCrewName = nameRows.find((r) => r.crew_id === opponentCrewId)?.crew_name ?? '';
  const { rows: ownerRows } = await pool.query(`SELECT owner_user_id FROM crew.crews WHERE crew_id = $1`, [myCrewId]);
  const isLeader = ownerRows[0]?.owner_user_id === userId;

  const days: BattleDay[] = [];
  let myWins = 0;
  let opponentWins = 0;
  let draws = 0;
  // 7일 전체를 항상 보여준다 — 예전엔 오늘까지만 자르고 이후 날짜는 아예 안 보여줬다.
  // 아직 안 온 미래 날짜는 조회 없이 "isFuture"로만 표시한다(빈 값 조회로 DB만 낭비하지 않게).
  for (let dateStr = battle.start_date; dateStr <= battle.end_date; dateStr = addDays(dateStr, 1)) {
    const isToday = dateStr === today;
    const isFuture = dateStr > today;

    let myValue: number | null = null;
    let oppValue: number | null = null;
    let myResult: DayResult = null;

    if (!isFuture) {
      myValue = await metricValueForDay(myCrewId, battle.metric_type, dateStr);
      oppValue = await metricValueForDay(opponentCrewId, battle.metric_type, dateStr);
    }

    if (!isToday && !isFuture) {
      const myComparable = myValue ?? (battle.metric_type === 'DISTANCE' ? 0 : Infinity);
      const oppComparable = oppValue ?? (battle.metric_type === 'DISTANCE' ? 0 : Infinity);
      // 같은 값(0km vs 0km 포함)이면 무승부 — 예전엔 >=/<=(이상/이하)로 비교해서 동률이 항상
      // "내가 이겼다"로 잡혔고, 상대 쪽에서 똑같은 로직을 돌리면 상대도 "이겼다"로 나와
      // 양쪽 다 성공으로 보이는 버그가 있었다.
      if (myComparable === oppComparable) {
        myResult = 'DRAW';
        draws++;
      } else {
        const iWon = battle.metric_type === 'DISTANCE' ? myComparable > oppComparable : myComparable < oppComparable;
        myResult = iWon ? 'WIN' : 'LOSE';
        if (iWon) myWins++;
        else opponentWins++;
      }

      const message =
        myResult === 'DRAW'
          ? `${dateStr} 결과: ${opponentCrewName} 크루와 무승부예요!`
          : myResult === 'WIN'
            ? `${dateStr} 결과: ${opponentCrewName} 크루와의 배틀에서 승리했어요!`
            : `${dateStr} 결과: ${opponentCrewName} 크루와의 배틀에서 아쉽게 졌어요. 내일은 이겨봐요!`;
      await announceOnce(myCrewId, battle.battle_id, `DAY_RESULT_${dateStr}`, message);
    }

    days.push({
      date: dateStr,
      crewAValue: isA ? myValue : oppValue,
      crewBValue: isA ? oppValue : myValue,
      crewAResult: flipForCrewA(myResult, isA),
      isToday,
      isFuture
    });
  }

  let showFinalBanner = false;
  let finalResult: 'WIN' | 'LOSE' | 'DRAW' | null = null;

  if (today > battle.end_date && battle.status === 'ACTIVE') {
    const winnerCrewId = myWins > opponentWins ? myCrewId : opponentWins > myWins ? opponentCrewId : null;
    await pool.query(`UPDATE crew.crew_battles SET status = 'COMPLETED', winner_crew_id = $1, resolved_at = now() WHERE battle_id = $2`, [
      winnerCrewId,
      battle.battle_id
    ]);
    finalResult = winnerCrewId === null ? 'DRAW' : winnerCrewId === myCrewId ? 'WIN' : 'LOSE';
    showFinalBanner = true;
    await announceOnce(
      myCrewId,
      battle.battle_id,
      'FINISHED',
      finalResult === 'WIN'
        ? `${opponentCrewName} 크루와의 배틀에서 승리했습니다!!!`
        : finalResult === 'DRAW'
          ? `${opponentCrewName} 크루와 무승부로 마무리됐어요! 다음엔 승부를 가려봐요.`
          : `${opponentCrewName} 크루와의 배틀, 더 성장해서 다음 기회에 이겨봅시다!`
    );
  } else if (today > battle.end_date && battle.status === 'COMPLETED') {
    showFinalBanner = true;
    finalResult = battle.winner_crew_id === null ? 'DRAW' : battle.winner_crew_id === myCrewId ? 'WIN' : 'LOSE';
  }

  return {
    battleId: battle.battle_id,
    metricType: battle.metric_type,
    myCrewId,
    myCrewName,
    opponentCrewId,
    opponentCrewName,
    days,
    myWins,
    opponentWins,
    draws,
    isLeader,
    showFinalBanner,
    finalResult
  };
}

// 러닝 완료 직후 이 사용자가 속한 크루에 진행 중인 배틀이 있으면 즉시 재계산해준다.
// getBattleView 자체가 이미 running_record.runs를 실시간으로 집계하는 쿼리라 DB에 따로 반영할
// "진행도" 값은 없고, 여기서 하는 일은 오늘 하루 결과 안내(announceOnce)를 다음 폴링까지
// 기다리지 않고 바로 크루 채팅방에 띄우는 것뿐이다 — announceOnce는 event_key UNIQUE라
// 여러 번 불러도 중복 발송되지 않는다.
export async function refreshCrewBattlesForUser(userId: string): Promise<void> {
  const pool = getPool();
  const { rows: crews } = await pool.query(
    `SELECT crew_id FROM crew.crew_members WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId]
  );
  for (const { crew_id: crewId } of crews) {
    try {
      await getBattleView(crewId, userId);
    } catch (err) {
      console.error(`refreshCrewBattlesForUser crew=${crewId} 실패:`, err);
    }
  }
}

export type BattleHistoryEntry = {
  battleId: string;
  metricType: BattleMetricType;
  opponentCrewName: string;
  status: 'COMPLETED' | 'DECLINED' | 'CANCELLED';
  result: 'WIN' | 'LOSE' | 'DRAW' | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
};

const BATTLE_HISTORY_PAGE_SIZE = 10;

// "크루 배틀" 탭의 "이전 배틀기록 조회" 버튼 — 10건씩 "더보기"로 이어서 불러온다(날짜 검색 UI는
// 없앴다). 시작만 됐다가 끝난(COMPLETED) 것뿐 아니라, 상대가 거절했거나(DECLINED) 크루장이
// 취소한(CANCELLED) 제안도 함께 보여준다 — "이전 배틀 기록"을 좁게 완주 이력으로만 보면 실제로
// 있었던 시도들이 누락된다.
export async function getBattleHistory(
  crewId: string,
  offset: number
): Promise<{ entries: BattleHistoryEntry[]; hasMore: boolean }> {
  const pool = getPool();
  // 다음 페이지 존재 여부를 별도 COUNT 쿼리 없이 알기 위해 페이지 크기보다 1건 더 가져온다.
  const { rows } = await pool.query(
    `SELECT * FROM crew.crew_battles
      WHERE (crew_a_id = $1 OR crew_b_id = $1) AND status IN ('COMPLETED', 'DECLINED', 'CANCELLED')
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
    [crewId, BATTLE_HISTORY_PAGE_SIZE + 1, offset]
  );
  const hasMore = rows.length > BATTLE_HISTORY_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, BATTLE_HISTORY_PAGE_SIZE) : rows;

  const crewIds = Array.from(new Set(pageRows.flatMap((r) => [r.crew_a_id, r.crew_b_id])));
  const nameMap = new Map<string, string>();
  if (crewIds.length > 0) {
    const { rows: nameRows } = await pool.query(`SELECT crew_id, crew_name FROM crew.crews WHERE crew_id = ANY($1::uuid[])`, [crewIds]);
    for (const row of nameRows) nameMap.set(row.crew_id, row.crew_name);
  }

  const entries = pageRows.map((row) => {
    const isA = row.crew_a_id === crewId;
    const opponentCrewId = isA ? row.crew_b_id : row.crew_a_id;
    let result: 'WIN' | 'LOSE' | 'DRAW' | null = null;
    if (row.status === 'COMPLETED') {
      result = row.winner_crew_id === null ? 'DRAW' : row.winner_crew_id === crewId ? 'WIN' : 'LOSE';
    }
    return {
      battleId: row.battle_id,
      metricType: row.metric_type,
      opponentCrewName: nameMap.get(opponentCrewId) ?? '상대 크루',
      status: row.status,
      result,
      startDate: row.start_date ? toDateStr(row.start_date) : null,
      endDate: row.end_date ? toDateStr(row.end_date) : null,
      createdAt: row.created_at
    };
  });

  return { entries, hasMore };
}

// 크루 단위로 진행 중인 배틀에서 빠져나온다(크루장만 가능).
export async function leaveBattle(crewId: string, leaderUserId: string): Promise<boolean> {
  const pool = getPool();
  const { rows: ownerRows } = await pool.query(`SELECT owner_user_id FROM crew.crews WHERE crew_id = $1`, [crewId]);
  if (ownerRows[0]?.owner_user_id !== leaderUserId) return false;
  const { rowCount } = await pool.query(
    `UPDATE crew.crew_battles SET status = 'CANCELLED', resolved_at = now()
      WHERE (crew_a_id = $1 OR crew_b_id = $1) AND status = 'ACTIVE'`,
    [crewId]
  );
  return (rowCount ?? 0) > 0;
}
