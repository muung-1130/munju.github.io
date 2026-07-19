import { getPool } from '@/lib/db';
import { addCrewChatMessage } from '@/lib/crewChat';

export type BattleMetricType = 'DISTANCE' | 'PACE';

// 이 모듈의 모든 "오늘/날짜" 계산은 Asia/Seoul 기준으로 통일한다(서버 타임존과 무관하게).
function todayKstDateString(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // sv-SE 로케일은 YYYY-MM-DD 포맷
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

// km 배틀: 내 크루 오늘 평균 km(소숫점 버림)과 같은 크루부터, 없으면 그보다 1km씩 "높은" 크루로 넓혀간다.
// 페이스 배틀: 내 크루 오늘 평균 페이스(소숫점 첫째 자리 버림)와 같은 크루부터, 없으면 0.1씩 "낮은(더 빠른)" 크루로 넓혀간다.
// 두 경우 모두 나보다 못한 쪽(km이 더 낮거나 페이스가 더 느린 크루)은 추천하지 않는다 — 요청에 명시된 대로 편도 탐색이다.
// 이전에는 "오늘 하루" 활동만으로 상대를 찾았는데(getCrewAvgKmForDate 등), 그날 아무도 안
// 뛰었으면 기준값 자체가 없어서 추천이 통째로 비어버리는 문제가 있었다. crew.crews에 이미
// crew-stats-scheduler가 매일 갱신해두는 최근 7일 평균(avg_weekly_distance_m/avg_weekly_pace_sec_per_km)이
// 있으니 그 캐시값을 기준으로 바꿔서, 오늘 활동이 없어도 안정적으로 추천이 뜨게 한다.
export async function getBattleCandidates(crewId: string, metricType: BattleMetricType): Promise<BattleCandidate[]> {
  const pool = getPool();

  const { rows: myRows } = await pool.query(
    `SELECT avg_weekly_distance_m, avg_weekly_pace_sec_per_km FROM crew.crews WHERE crew_id = $1`,
    [crewId]
  );
  const my = myRows[0];
  if (!my) return [];

  let myTarget: number;
  if (metricType === 'DISTANCE') {
    if (my.avg_weekly_distance_m === null) return [];
    myTarget = Math.floor(Number(my.avg_weekly_distance_m) / 1000);
  } else {
    if (my.avg_weekly_pace_sec_per_km === null) return [];
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
      if (tier < 0) continue;
      candidates.push({ crewId: row.crew_id, crewName: row.crew_name, memberCount: Number(row.member_count), statValue: Math.round(avgKm * 100) / 100, tier });
    } else {
      if (row.avg_weekly_pace_sec_per_km === null) continue;
      const avgPaceMin = Number(row.avg_weekly_pace_sec_per_km) / 60;
      const tierValue = truncate1(avgPaceMin);
      const tier = Math.round((myTarget - tierValue) * 10) / 10;
      if (tier < 0) continue;
      candidates.push({ crewId: row.crew_id, crewName: row.crew_name, memberCount: Number(row.member_count), statValue: Math.round(avgPaceMin * 100) / 100, tier });
    }
  }

  candidates.sort((a, b) => a.tier - b.tier || a.crewName.localeCompare(b.crewName));
  return candidates;
}

export async function getActiveOrPendingBattleForCrew(crewId: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM crew.crew_battles WHERE (crew_a_id = $1 OR crew_b_id = $1) AND status IN ('PROPOSED', 'ACTIVE') ORDER BY created_at DESC LIMIT 1`,
    [crewId]
  );
  return rows[0] ?? null;
}

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

// 크루장 승인/과반수 찬성 → 배틀 시작 / 크루장 거절·과반수 반대 → 무산.
// 이 전체 워크플로는 제안한 크루(crew_a)의 채팅방 안에서만 진행된다(요청에 상대 크루 쪽 화면 언급이 없음).
export async function resolveBattle(battleId: string, approve: boolean): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT * FROM crew.crew_battles WHERE battle_id = $1 AND status = 'PROPOSED'`, [battleId]);
  const battle = rows[0];
  if (!battle) return false;

  if (approve) {
    await pool.query(
      `UPDATE crew.crew_battles SET status = 'ACTIVE', start_date = CURRENT_DATE, end_date = CURRENT_DATE + 6, resolved_at = now() WHERE battle_id = $1`,
      [battleId]
    );
  } else {
    await pool.query(`UPDATE crew.crew_battles SET status = 'DECLINED', resolved_at = now() WHERE battle_id = $1`, [battleId]);
  }

  const { rows: nameRows } = await pool.query(`SELECT crew_id, crew_name FROM crew.crews WHERE crew_id IN ($1, $2)`, [
    battle.crew_a_id,
    battle.crew_b_id
  ]);
  const opponentName = nameRows.find((r) => r.crew_id === battle.crew_b_id)?.crew_name ?? '상대 크루';
  const metricLabel = METRIC_LABEL[battle.metric_type as BattleMetricType];

  if (approve) {
    await announceOnce(battle.crew_a_id, battleId, 'STARTED', `🔥 ${opponentName} 크루와 ${metricLabel} 배틀이 시작됐어요! 1주일간 힘내봐요 💪`);
  } else {
    await announceOnce(battle.crew_a_id, battleId, 'DECLINED', `이번 ${opponentName} 크루와의 배틀 제안은 다음 기회에 도전해봐요 🙏`);
  }

  // 투표가 끝났으니(승인/거절 어느 쪽이든) 이 배틀에 걸려있던 투표 기록은 더 이상 필요 없다.
  await pool.query(`DELETE FROM crew.crew_battle_votes WHERE battle_id = $1`, [battleId]);

  return true;
}

export type VoteTally = { agree: number; disagree: number; total: number };

// 크루원이 찬성/반대 투표를 한다. 과반수(전체 ACTIVE 멤버 기준)에 도달하면 자동으로 승인/거절 처리한다.
export async function castVote(battleId: string, userId: string, vote: 'AGREE' | 'DISAGREE'): Promise<VoteTally | null> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT * FROM crew.crew_battles WHERE battle_id = $1 AND status = 'PROPOSED'`, [battleId]);
  const battle = rows[0];
  if (!battle) return null;

  const isMember = await pool.query(`SELECT 1 FROM crew.crew_members WHERE crew_id = $1 AND user_id = $2 AND status = 'ACTIVE'`, [
    battle.crew_a_id,
    userId
  ]);
  if (isMember.rows.length === 0) return null;

  await pool.query(
    `INSERT INTO crew.crew_battle_votes (battle_id, user_id, vote) VALUES ($1, $2, $3)
     ON CONFLICT (battle_id, user_id) DO UPDATE SET vote = EXCLUDED.vote, voted_at = now()`,
    [battleId, userId, vote]
  );

  const total = await getActiveMemberCount(battle.crew_a_id);
  const { rows: tallyRows } = await pool.query(`SELECT vote, COUNT(*) AS c FROM crew.crew_battle_votes WHERE battle_id = $1 GROUP BY vote`, [
    battleId
  ]);
  const agree = Number(tallyRows.find((r) => r.vote === 'AGREE')?.c ?? 0);
  const disagree = Number(tallyRows.find((r) => r.vote === 'DISAGREE')?.c ?? 0);

  if (agree > total / 2) await resolveBattle(battleId, true);
  else if (disagree > total / 2) await resolveBattle(battleId, false);

  return { agree, disagree, total };
}

// 크루장이 크루원 동의 없이도 바로 결정할 수 있다.
export async function leaderDecide(battleId: string, leaderUserId: string, approve: boolean): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT crew_a_id FROM crew.crew_battles WHERE battle_id = $1 AND status = 'PROPOSED'`, [battleId]);
  const battle = rows[0];
  if (!battle) return false;
  const { rows: ownerRows } = await pool.query(`SELECT owner_user_id FROM crew.crews WHERE crew_id = $1`, [battle.crew_a_id]);
  if (ownerRows[0]?.owner_user_id !== leaderUserId) return false;
  return resolveBattle(battleId, approve);
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
};

export async function getPendingBattleView(crewId: string, userId: string): Promise<PendingBattleView | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT b.*, c.crew_name AS opponent_name, owner.owner_user_id
       FROM crew.crew_battles b
       JOIN crew.crews c ON c.crew_id = b.crew_b_id
       JOIN crew.crews owner ON owner.crew_id = b.crew_a_id
      WHERE b.crew_a_id = $1 AND b.status = 'PROPOSED'
      ORDER BY b.created_at DESC LIMIT 1`,
    [crewId]
  );
  const battle = rows[0];
  if (!battle) return null;

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

  const metricLabel = METRIC_LABEL[battle.metric_type as BattleMetricType];
  return {
    battleId: battle.battle_id,
    metricType: battle.metric_type,
    opponentCrewId: battle.crew_b_id,
    opponentCrewName: battle.opponent_name,
    description: `${battle.opponent_name} 크루와 1주일간 ${metricLabel} 배틀에 참여하시겠습니까?`,
    tally: { agree, disagree, total },
    myVote: (myVoteRows[0]?.vote as 'AGREE' | 'DISAGREE') ?? null,
    isLeader: battle.owner_user_id === userId
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

export type BattleDay = { date: string; crewAValue: number | null; crewBValue: number | null; crewAWon: boolean | null; isToday: boolean };

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
  showFinalBanner: boolean;
  finalResult: 'WIN' | 'LOSE' | null;
  isLeader: boolean;
};

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
  const lastDayToShow = today < battle.end_date ? today : battle.end_date;
  for (let dateStr = battle.start_date; dateStr <= lastDayToShow; dateStr = addDays(dateStr, 1)) {
    const myValue = await metricValueForDay(myCrewId, battle.metric_type, dateStr);
    const oppValue = await metricValueForDay(opponentCrewId, battle.metric_type, dateStr);
    const isToday = dateStr === today;
    let myWon: boolean | null = null;
    if (!isToday) {
      const myComparable = myValue ?? (battle.metric_type === 'DISTANCE' ? 0 : Infinity);
      const oppComparable = oppValue ?? (battle.metric_type === 'DISTANCE' ? 0 : Infinity);
      myWon = battle.metric_type === 'DISTANCE' ? myComparable >= oppComparable : myComparable <= oppComparable;
      if (myWon) myWins++;
      else opponentWins++;

      await announceOnce(
        myCrewId,
        battle.battle_id,
        `DAY_RESULT_${dateStr}`,
        myWon
          ? `📅 ${dateStr} 결과: ${opponentCrewName} 크루와의 배틀에서 승리했어요! 🎉`
          : `📅 ${dateStr} 결과: ${opponentCrewName} 크루와의 배틀에서 아쉽게 졌어요. 내일은 이겨봐요!`
      );
    }
    days.push({ date: dateStr, crewAValue: isA ? myValue : oppValue, crewBValue: isA ? oppValue : myValue, crewAWon: isA ? myWon : myWon === null ? null : !myWon, isToday });
  }

  let showFinalBanner = false;
  let finalResult: 'WIN' | 'LOSE' | null = null;

  if (today > battle.end_date && battle.status === 'ACTIVE') {
    const winnerCrewId = myWins > opponentWins ? myCrewId : opponentWins > myWins ? opponentCrewId : myCrewId;
    await pool.query(`UPDATE crew.crew_battles SET status = 'COMPLETED', winner_crew_id = $1, resolved_at = now() WHERE battle_id = $2`, [
      winnerCrewId,
      battle.battle_id
    ]);
    finalResult = winnerCrewId === myCrewId ? 'WIN' : 'LOSE';
    showFinalBanner = true;
    await announceOnce(
      myCrewId,
      battle.battle_id,
      'FINISHED',
      finalResult === 'WIN'
        ? `🏆 ${opponentCrewName} 크루와의 배틀에서 승리했습니다!!!`
        : `${opponentCrewName} 크루와의 배틀, 더 성장해서 다음 기회에 이겨봅시다!`
    );
  } else if (today > battle.end_date && battle.status === 'COMPLETED') {
    showFinalBanner = true;
    finalResult = battle.winner_crew_id === myCrewId ? 'WIN' : 'LOSE';
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
    isLeader,
    showFinalBanner,
    finalResult
  };
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
