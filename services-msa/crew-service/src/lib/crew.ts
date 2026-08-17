import { getPool } from './db.js';
import { parseDistrictFromDong } from './region.js';

export type CrewSummary = {
  crewId: string;
  crewName: string;
  description: string | null;
  regionCode: string | null;
  meetingLocation: string | null;
  targetDistanceMinM: number | null;
  targetDistanceMaxM: number | null;
  paceMinSecPerKm: number | null;
  paceMaxSecPerKm: number | null;
  minimumWeeklyFrequency: number | null;
  joinType: string;
  maxMembers: number;
  status: string;
  memberCount: number;
  ownerNickname: string | null;
  createdAt: string;
  fitsMyConditions: boolean;
  avgWeeklyDistanceM: number | null;
  avgWeeklyPaceSecPerKm: number | null;
  statsUpdatedAt: string | null;
};

type UserPattern = {
  district: string | null;
  preferredDistanceM: number | null;
  targetPaceSecPerKm: number | null;
  weeklyFrequency: number | null;
};

async function getUserPattern(userId: string | null, dong: string | null | undefined): Promise<UserPattern> {
  const district = parseDistrictFromDong(dong);
  if (!userId) return { district, preferredDistanceM: null, targetPaceSecPerKm: null, weeklyFrequency: null };

  const pool = getPool();
  const { rows } = await pool.query<{
    preferred_distance_m: number | null;
    target_pace_sec_per_km: number | null;
    weekly_target_distance_m: number | null;
  }>(
    `SELECT preferred_distance_m, target_pace_sec_per_km, weekly_target_distance_m
       FROM auth_user.user_running_preferences WHERE user_id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return { district, preferredDistanceM: null, targetPaceSecPerKm: null, weeklyFrequency: null };

  const weeklyFrequency =
    row.weekly_target_distance_m && row.preferred_distance_m
      ? Math.round(row.weekly_target_distance_m / row.preferred_distance_m)
      : null;

  return {
    district,
    preferredDistanceM: row.preferred_distance_m,
    targetPaceSecPerKm: row.target_pace_sec_per_km,
    weeklyFrequency
  };
}

function fitsPattern(
  crew: {
    region_code: string | null;
    target_distance_min_m: number | null;
    target_distance_max_m: number | null;
    pace_min_sec_per_km: number | null;
    pace_max_sec_per_km: number | null;
    minimum_weekly_frequency: number | null;
  },
  pattern: UserPattern
): boolean {
  // 크루가 특정 조건에 값을 넣지 않았다면(크루 만들기에서 "무관" 체크) 그 조건은 항상 통과시킨다.
  // 예전에는 내 선호 정보(지역/거리/페이스)가 하나라도 비어 있으면 크루 쪽 조건과 무관하게 무조건
  // false를 반환했는데, 그러면 모든 조건이 "무관"인 크루조차 내 선호 정보가 없다는 이유만으로
  // 모집 목록에서 안 보이는 게 말이 안 되는 상황이 생겼다 — 조건별로 독립적으로 판단하도록 수정.
  if (crew.region_code) {
    if (!pattern.district || crew.region_code !== pattern.district) return false;
  }
  if (crew.target_distance_min_m || crew.target_distance_max_m) {
    if (!pattern.preferredDistanceM) return false;
    if (crew.target_distance_min_m && pattern.preferredDistanceM < crew.target_distance_min_m) return false;
    if (crew.target_distance_max_m && pattern.preferredDistanceM > crew.target_distance_max_m) return false;
  }
  if (crew.pace_min_sec_per_km || crew.pace_max_sec_per_km) {
    if (!pattern.targetPaceSecPerKm) return false;
    if (crew.pace_min_sec_per_km && pattern.targetPaceSecPerKm < crew.pace_min_sec_per_km) return false;
    if (crew.pace_max_sec_per_km && pattern.targetPaceSecPerKm > crew.pace_max_sec_per_km) return false;
  }
  if (crew.minimum_weekly_frequency && (pattern.weeklyFrequency ?? 0) < crew.minimum_weekly_frequency) return false;
  return true;
}

export async function getCrews(userId: string | null, dong: string | null | undefined): Promise<CrewSummary[]> {
  const pool = getPool();
  const pattern = await getUserPattern(userId, dong);

  const { rows } = await pool.query(
    `SELECT c.crew_id, c.crew_name, c.description, c.region_code, c.meeting_location,
            c.target_distance_min_m, c.target_distance_max_m, c.pace_min_sec_per_km, c.pace_max_sec_per_km,
            c.minimum_weekly_frequency, c.join_type, c.max_members, c.status, c.created_at,
            c.avg_weekly_distance_m, c.avg_weekly_pace_sec_per_km, c.stats_updated_at,
            u.nickname AS owner_nickname,
            (SELECT COUNT(*) FROM crew.crew_members m WHERE m.crew_id = c.crew_id AND m.status = 'ACTIVE') AS member_count
       FROM crew.crews c
       JOIN auth_user.users u ON u.user_id = c.owner_user_id
      ORDER BY c.created_at DESC`
  );

  return rows.map((row) => ({
    crewId: row.crew_id,
    crewName: row.crew_name,
    description: row.description,
    regionCode: row.region_code,
    meetingLocation: row.meeting_location,
    targetDistanceMinM: row.target_distance_min_m,
    targetDistanceMaxM: row.target_distance_max_m,
    paceMinSecPerKm: row.pace_min_sec_per_km,
    paceMaxSecPerKm: row.pace_max_sec_per_km,
    minimumWeeklyFrequency: row.minimum_weekly_frequency,
    joinType: row.join_type,
    maxMembers: row.max_members,
    status: row.status,
    memberCount: Number(row.member_count),
    ownerNickname: row.owner_nickname,
    createdAt: row.created_at,
    fitsMyConditions: fitsPattern(row, pattern),
    avgWeeklyDistanceM: row.avg_weekly_distance_m,
    avgWeeklyPaceSecPerKm: row.avg_weekly_pace_sec_per_km,
    statsUpdatedAt: row.stats_updated_at
  }));
}

export type CrewWeeklyStats = {
  avgWeeklyDistanceM: number | null;
  avgWeeklyPaceSecPerKm: number | null;
  statsUpdatedAt: string | null;
};

// 채팅방 헤더의 "우리 크루" 아이콘 호버 팝업용 — services/crew-stats-scheduler가 매일 자정(KST)에
// 미리 계산해둔 캐시 값만 그대로 읽는다(여기서 직접 계산하지 않음).
export async function getCrewWeeklyStats(crewId: string): Promise<CrewWeeklyStats | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT avg_weekly_distance_m, avg_weekly_pace_sec_per_km, stats_updated_at
       FROM crew.crews WHERE crew_id = $1`,
    [crewId]
  );
  if (rows.length === 0) return null;
  return {
    avgWeeklyDistanceM: rows[0].avg_weekly_distance_m,
    avgWeeklyPaceSecPerKm: rows[0].avg_weekly_pace_sec_per_km,
    statsUpdatedAt: rows[0].stats_updated_at
  };
}

export type CrewMemberStats = {
  userId: string;
  nickname: string;
  role: string;
  joinedAt: string;
  last7DaysDistanceM: number;
  last7DaysRunCount: number;
  lastRunAt: string | null;
};

// "내 크루" 탭의 크루원 목록 — 각자 최근 7일 러닝 스펙(거리/횟수/마지막 러닝)을 함께 보여준다.
// crew.crew_members와 running_record.runs를 조인하는 건 이 서비스 안에서 이미 크루 배틀 평균
// 계산(lib/crewBattle.ts)에 쓰이던 것과 같은 패턴이다 — 새로 도입하는 경계 위반이 아니다.
export async function getCrewMembersWithStats(crewId: string): Promise<CrewMemberStats[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT m.user_id, u.nickname, m.role, m.joined_at,
            COALESCE(SUM(r.distance_m) FILTER (WHERE r.started_at >= now() - INTERVAL '7 days'), 0) AS last7_distance_m,
            COUNT(r.run_id) FILTER (WHERE r.started_at >= now() - INTERVAL '7 days') AS last7_run_count,
            MAX(r.started_at) AS last_run_at
       FROM crew.crew_members m
       JOIN auth_user.users u ON u.user_id = m.user_id
       LEFT JOIN running_record.runs r ON r.user_id = m.user_id AND r.status = 'COMPLETED'
      WHERE m.crew_id = $1 AND m.status = 'ACTIVE'
      GROUP BY m.user_id, u.nickname, m.role, m.joined_at
      ORDER BY m.role = 'LEADER' DESC, last7_distance_m DESC`,
    [crewId]
  );
  return rows.map((row) => ({
    userId: row.user_id,
    nickname: row.nickname,
    role: row.role,
    joinedAt: row.joined_at,
    last7DaysDistanceM: Number(row.last7_distance_m),
    last7DaysRunCount: Number(row.last7_run_count),
    lastRunAt: row.last_run_at
  }));
}

// 채팅방 입장 = crew_chat.chat_rooms에 이 크루의 방을 보장(크루당 하나)하고,
// crew_chat.chat_participant_states에 참가자로 기록한다. 메시지 "내용"은 지금처럼
// MongoDB에 room_id = crew_id로 저장한다(lib/crewChat.ts) — chat_rooms/participant_states는
// SQL 쪽 메타데이터만 담당한다.
export async function recordCrewChatJoin(crewId: string, userId: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO crew_chat.chat_rooms (crew_id) VALUES ($1)
     ON CONFLICT (crew_id) DO UPDATE SET crew_id = EXCLUDED.crew_id
     RETURNING room_id`,
    [crewId]
  );
  const roomId = rows[0].room_id;
  await pool.query(
    `INSERT INTO crew_chat.chat_participant_states (room_id, user_id, status, joined_at)
     VALUES ($1, $2, 'ACTIVE', now())
     ON CONFLICT (room_id, user_id) DO UPDATE SET status = 'ACTIVE', joined_at = now()`,
    [roomId, userId]
  );
}

// 크루 배틀 패널은 "내 크루" 하나를 기준으로 보여준다. 사용자가 여러 크루의 멤버일 수 있어
// (크루장이 여러 크루를 만들 수도 있으므로) 가장 먼저 가입한 크루를 대표로 사용한다.
export async function getMyCrewForBattle(userId: string): Promise<{ crewId: string; crewName: string } | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT c.crew_id, c.crew_name
       FROM crew.crew_members m
       JOIN crew.crews c ON c.crew_id = m.crew_id
      WHERE m.user_id = $1 AND m.status = 'ACTIVE'
      ORDER BY m.joined_at ASC
      LIMIT 1`,
    [userId]
  );
  return rows[0] ? { crewId: rows[0].crew_id, crewName: rows[0].crew_name } : null;
}

export type MyCrewInfo = {
  crewId: string;
  crewName: string;
  description: string | null;
  regionCode: string | null;
  meetingLocation: string | null;
  role: string;
  memberCount: number;
  maxMembers: number;
  joinedAt: string;
};

// 마이페이지 "내 크루" 섹션용 — 사용자가 ACTIVE로 가입돼 있는 크루 전부(여러 개일 수 있음).
export async function getMyActiveCrews(userId: string): Promise<MyCrewInfo[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT c.crew_id, c.crew_name, c.description, c.region_code, c.meeting_location, c.max_members,
            m.role, m.joined_at,
            (SELECT COUNT(*) FROM crew.crew_members m2 WHERE m2.crew_id = c.crew_id AND m2.status = 'ACTIVE') AS member_count
       FROM crew.crew_members m
       JOIN crew.crews c ON c.crew_id = m.crew_id
      WHERE m.user_id = $1 AND m.status = 'ACTIVE'
      ORDER BY m.joined_at ASC`,
    [userId]
  );
  return rows.map((row) => ({
    crewId: row.crew_id,
    crewName: row.crew_name,
    description: row.description,
    regionCode: row.region_code,
    meetingLocation: row.meeting_location,
    role: row.role,
    memberCount: Number(row.member_count),
    maxMembers: row.max_members,
    joinedAt: row.joined_at
  }));
}

// 로그인 직후 크루 채팅 위젯을 복원하기 위해, 이 사용자가 이미 한 번이라도 입장한 채팅방 중
// 가장 최근 것을 찾는다(로그아웃해도 crew_chat/crew_members는 DB에 남아있으므로, 세션이
// 새로 생겨도 항상 같은 자리에 아이콘이 다시 뜰 수 있다). 크루를 나가서 더 이상 ACTIVE 멤버가
// 아니면 복원하지 않는다.
export async function getMostRecentCrewChat(userId: string): Promise<{ crewId: string; crewName: string } | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT r.crew_id, c.crew_name
       FROM crew_chat.chat_participant_states s
       JOIN crew_chat.chat_rooms r ON r.room_id = s.room_id
       JOIN crew.crews c ON c.crew_id = r.crew_id
       JOIN crew.crew_members m ON m.crew_id = r.crew_id AND m.user_id = s.user_id AND m.status = 'ACTIVE'
      WHERE s.user_id = $1 AND s.status = 'ACTIVE'
      ORDER BY s.joined_at DESC
      LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) return null;
  return { crewId: rows[0].crew_id, crewName: rows[0].crew_name };
}

// 채팅방에 들어오면 그 크루의 정식 멤버(기본 역할: MEMBER)로도 등록한다. 이미 멤버(예: 크루장은
// LEADER)라면 역할은 그대로 두고 상태만 ACTIVE로 되돌린다.
export async function ensureCrewMember(crewId: string, userId: string) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO crew.crew_members (crew_id, user_id, role, status)
     VALUES ($1, $2, 'MEMBER', 'ACTIVE')
     ON CONFLICT (crew_id, user_id) DO UPDATE SET status = 'ACTIVE', left_at = NULL`,
    [crewId, userId]
  );
}

export type LeaveCrewResult = 'ok' | 'crew-deleted' | 'not-member';

// 크루 채팅방 "나가기" = 크루 탈퇴. 남은 ACTIVE 멤버가 없으면 크루 자체를 지운다.
// crew.crew_battles는 crew.crews를 CASCADE 없이 참조하고 있어서(배틀 히스토리를 실수로
// 지우는 걸 막기 위한 기본값), 크루를 삭제하기 전에 이 크루가 걸린 배틀 행을 먼저 지워야
// FK 위반 없이 삭제된다 — crew_battle_votes/crew_battle_chat_events는 crew_battles에
// CASCADE로 걸려 있어 같이 정리된다. crew_members/crew_chat/crew_join_requests는
// crew.crews에 CASCADE로 걸려 있어 크루 삭제만으로 자동 정리된다.
export async function leaveCrew(crewId: string, userId: string): Promise<LeaveCrewResult> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rowCount } = await client.query(
      `UPDATE crew.crew_members SET status = 'LEFT', left_at = now()
        WHERE crew_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
      [crewId, userId]
    );
    if (!rowCount) {
      await client.query('ROLLBACK');
      return 'not-member';
    }

    const { rows } = await client.query(
      `SELECT COUNT(*) FROM crew.crew_members WHERE crew_id = $1 AND status = 'ACTIVE'`,
      [crewId]
    );
    const remaining = Number(rows[0].count);

    if (remaining === 0) {
      await client.query(`DELETE FROM crew.crew_battles WHERE crew_a_id = $1 OR crew_b_id = $1 OR winner_crew_id = $1`, [crewId]);
      await client.query(`DELETE FROM crew.crews WHERE crew_id = $1`, [crewId]);
      await client.query('COMMIT');
      return 'crew-deleted';
    }

    await client.query('COMMIT');
    return 'ok';
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getCrewJoinType(
  crewId: string
): Promise<{ joinType: string; ownerUserId: string; crewName: string } | null> {
  const pool = getPool();
  const { rows } = await pool.query('SELECT join_type, owner_user_id, crew_name FROM crew.crews WHERE crew_id = $1', [
    crewId
  ]);
  if (rows.length === 0) return null;
  return { joinType: rows[0].join_type, ownerUserId: rows[0].owner_user_id, crewName: rows[0].crew_name };
}

export async function isActiveCrewMember(crewId: string, userId: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM crew.crew_members WHERE crew_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [crewId, userId]
  );
  return rows.length > 0;
}

// 크루는 한 사람당 하나만 가입할 수 있다. targetCrewId가 아닌 다른 크루에 이미 ACTIVE로
// 가입돼 있으면 그 크루 정보를 돌려줘서 "먼저 탈퇴해주세요" 안내에 쓸 수 있게 한다.
export async function getOtherActiveCrewMembership(
  userId: string,
  targetCrewId: string
): Promise<{ crewId: string; crewName: string } | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT c.crew_id, c.crew_name
       FROM crew.crew_members m
       JOIN crew.crews c ON c.crew_id = m.crew_id
      WHERE m.user_id = $1 AND m.status = 'ACTIVE' AND m.crew_id <> $2
      LIMIT 1`,
    [userId, targetCrewId]
  );
  return rows[0] ? { crewId: rows[0].crew_id, crewName: rows[0].crew_name } : null;
}

// 허가방식(PRIVATE) 크루에 가입 신청서를 낸다. 이미 대기중인 신청이 있으면 중복으로 만들지 않는다.
// 성공하면 join_request_id를 반환해 호출부가 Kafka 이벤트(JoinRequestSubmitted)를 발행할 수 있게 한다.
export async function createJoinRequest(crewId: string, userId: string, message: string): Promise<string | null> {
  const pool = getPool();
  const existing = await pool.query(
    `SELECT 1 FROM crew.crew_join_requests WHERE crew_id = $1 AND applicant_user_id = $2 AND status = 'PENDING'`,
    [crewId, userId]
  );
  if (existing.rows.length > 0) return null;

  const { rows } = await pool.query(
    `INSERT INTO crew.crew_join_requests (crew_id, applicant_user_id, message, status)
     VALUES ($1, $2, $3, 'PENDING')
     RETURNING join_request_id`,
    [crewId, userId, message]
  );
  return rows[0].join_request_id;
}

export type DecideJoinRequestResult = {
  crewId: string;
  crewName: string;
  applicantUserId: string;
  applicantNickname: string;
  ownerUserId: string;
};

// 크루장이 가입 신청을 승인/거절한다. 승인되면 그제서야 crew_members에 정식으로 들어간다.
// 승인/거절 자체는 이 함수 안에서 바로 반영되고(동기), "누구에게 어떤 알림을 띄울지"는 반환값을
// 받은 호출부가 Kafka 이벤트(JoinRequestApproved)로 발행해 별도 consumer가 비동기 처리한다.
export async function decideJoinRequest(
  joinRequestId: string,
  reviewerUserId: string,
  approve: boolean
): Promise<DecideJoinRequestResult | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT r.crew_id, r.applicant_user_id, c.owner_user_id, c.crew_name, u.nickname AS applicant_nickname
       FROM crew.crew_join_requests r
       JOIN crew.crews c ON c.crew_id = r.crew_id
       JOIN auth_user.users u ON u.user_id = r.applicant_user_id
      WHERE r.join_request_id = $1 AND r.status = 'PENDING'`,
    [joinRequestId]
  );
  const row = rows[0];
  if (!row || row.owner_user_id !== reviewerUserId) return null;

  await pool.query(
    `UPDATE crew.crew_join_requests SET status = $1, reviewed_by = $2, reviewed_at = now() WHERE join_request_id = $3`,
    [approve ? 'APPROVED' : 'REJECTED', reviewerUserId, joinRequestId]
  );

  if (approve) {
    await ensureCrewMember(row.crew_id, row.applicant_user_id);
  }

  return {
    crewId: row.crew_id,
    crewName: row.crew_name,
    applicantUserId: row.applicant_user_id,
    applicantNickname: row.applicant_nickname,
    ownerUserId: row.owner_user_id
  };
}

export type CreateCrewInput = {
  ownerUserId: string;
  crewName: string;
  description: string;
  regionCode: string | null;
  meetingLocation: string | null;
  targetDistanceMinM: number | null;
  targetDistanceMaxM: number | null;
  paceMinSecPerKm: number | null;
  paceMaxSecPerKm: number | null;
  minimumWeeklyFrequency: number | null;
  joinType: 'PUBLIC' | 'PRIVATE';
  maxMembers: number;
};

// 새 크루를 만들고, 만든 사람을 곧바로 LEADER 멤버로 등록한다.
export async function createCrew(input: CreateCrewInput): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO crew.crews
       (owner_user_id, crew_name, description, region_code, meeting_location,
        target_distance_min_m, target_distance_max_m, pace_min_sec_per_km, pace_max_sec_per_km,
        minimum_weekly_frequency, join_type, max_members, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'RECRUITING')
     RETURNING crew_id`,
    [
      input.ownerUserId,
      input.crewName,
      input.description || null,
      input.regionCode,
      input.meetingLocation,
      input.targetDistanceMinM,
      input.targetDistanceMaxM,
      input.paceMinSecPerKm,
      input.paceMaxSecPerKm,
      input.minimumWeeklyFrequency,
      input.joinType,
      input.maxMembers
    ]
  );
  const crewId = rows[0].crew_id;
  await pool.query(
    `INSERT INTO crew.crew_members (crew_id, user_id, role, status) VALUES ($1, $2, 'LEADER', 'ACTIVE')`,
    [crewId, input.ownerUserId]
  );
  return crewId;
}
