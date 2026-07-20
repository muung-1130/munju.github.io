import { getPool } from '@/lib/db';

export type MarathonRace = {
  raceId: number;
  raceName: string;
  raceDate: string | null;
  registrationStartDate: string | null;
  registrationEndDate: string | null;
  souvenir: string | null;
  raceDistance: string;
  region: string | null;
  officialWebsite: string;
  isExclusiveCollab: boolean;
  capacity: number | null;
};

export type RegistrationStatus = 'UPCOMING' | 'OPEN' | 'CLOSED' | 'UNKNOWN';

// pg는 DATE 컬럼을 Date 객체로 돌려주므로(문자열 아님), 이 모듈 전체에서 순수 캘린더 날짜
// 문자열로만 다루기 위해 행을 읽자마자 문자열로 통일한다.
function toDateStrOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}

function todayKstDateString(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

export function getRegistrationStatus(race: Pick<MarathonRace, 'registrationStartDate' | 'registrationEndDate'>): RegistrationStatus {
  const today = todayKstDateString();
  if (!race.registrationStartDate && !race.registrationEndDate) return 'UNKNOWN';
  if (race.registrationStartDate && today < race.registrationStartDate) return 'UPCOMING';
  if (race.registrationEndDate && today > race.registrationEndDate) return 'CLOSED';
  return 'OPEN';
}

function mapRace(row: any): MarathonRace {
  return {
    raceId: Number(row.race_id),
    raceName: row.race_name,
    raceDate: toDateStrOrNull(row.race_date),
    registrationStartDate: toDateStrOrNull(row.registration_start_date),
    registrationEndDate: toDateStrOrNull(row.registration_end_date),
    souvenir: row.souvenir,
    raceDistance: row.race_distance,
    region: row.region,
    officialWebsite: row.official_website,
    isExclusiveCollab: row.is_exclusive_collab ?? false,
    capacity: row.capacity !== null && row.capacity !== undefined ? Number(row.capacity) : null
  };
}

const RACE_COLUMNS = `race_id, race_name, race_date, registration_start_date, registration_end_date,
            souvenir, race_distance, region, official_website, is_exclusive_collab, capacity`;

export type DistanceBucket = 'KM5' | 'KM10' | 'KM15' | 'HALF' | 'FULL';

// race_distance는 "10km" 같은 형식이 대부분이지만 "풀"/"하프"/"63빌딩"/"GPS아트 · 4.17부문"처럼
// km으로 딱 떨어지지 않는 값도 섞여 있는 크롤링 원본이라, 순수 "<숫자>km" 패턴과 풀/하프만
// 숫자로 환산하고 나머지는 NULL(=거리 필터에서는 제외, 전체보기에는 계속 노출)로 둔다.
const DISTANCE_KM_SQL_EXPR = `
  CASE
    WHEN race_distance = '풀' THEN 42.195
    WHEN race_distance = '하프' THEN 21.0975
    WHEN race_distance ~* '^[0-9]+(\\.[0-9]+)?km$' THEN regexp_replace(race_distance, 'km$', '', 'i')::numeric
    ELSE NULL
  END
`;

// 5km이하 / 5km초과~10km이하 / 10km초과~20km미만 / 20km이상~30km이하(하프 포함) / 30km초과.
// "정확히 20km"가 10~20 구간(미만)과 20~30 구간(초과) 어느 쪽에도 안 걸리는 경계였는데, 20km는
// 하프(21.0975km)에 더 가까운 대회로 보는 게 자연스러워서 하프 버킷 쪽 경계를 20km 이상(포함)으로
// 붙였다 — 그 결과로 15km 버킷의 상한(20km 미만)과 하프 버킷의 하한(20km 이상)이 정확히 맞물린다.
const DISTANCE_BUCKET_SQL: Record<DistanceBucket, string> = {
  KM5: `(${DISTANCE_KM_SQL_EXPR}) <= 5`,
  KM10: `(${DISTANCE_KM_SQL_EXPR}) > 5 AND (${DISTANCE_KM_SQL_EXPR}) <= 10`,
  KM15: `(${DISTANCE_KM_SQL_EXPR}) > 10 AND (${DISTANCE_KM_SQL_EXPR}) < 20`,
  HALF: `(${DISTANCE_KM_SQL_EXPR}) >= 20 AND (${DISTANCE_KM_SQL_EXPR}) <= 30`,
  FULL: `(${DISTANCE_KM_SQL_EXPR}) > 30`
};

export type MarathonListFilter = {
  keyword: string | null;
  region: string | null;
  includeClosed: boolean;
  includePast: boolean;
  distanceBucket: DistanceBucket | null;
  dateFrom: string | null;
  dateTo: string | null;
  page: number;
};

// 접수 마감 여부 판정 SQL — lib의 getRegistrationStatus()가 CLOSED로 판단하는 조건과 동일하게 맞춘다.
const REGISTRATION_CLOSED_SQL = `(registration_end_date IS NOT NULL AND CURRENT_DATE > registration_end_date)`;

const PAGE_SIZE = 20;

export async function getMarathonRaces(filter: MarathonListFilter): Promise<{ races: MarathonRace[]; total: number; page: number; pageSize: number }> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.keyword && filter.keyword.trim().length > 0) {
    params.push(`%${filter.keyword.trim()}%`);
    conditions.push(`(race_name ILIKE $${params.length} OR region ILIKE $${params.length})`);
  }
  if (filter.region && filter.region.trim().length > 0) {
    params.push(filter.region.trim());
    conditions.push(`region = $${params.length}`);
  }
  // "지난 대회 포함"이 꺼져 있으면 이미 끝난 대회(대회일이 지남)를 숨긴다. race_date가 비어 있는
  // (데이터 누락) 대회는 판단할 수 없으니 보수적으로 계속 노출한다. "마감된 대회 포함"은 그와 별개로
  // "대회일은 아직 안 지났지만 접수는 이미 끝난" 경우를 걸러주는 토글이다.
  if (!filter.includePast) {
    conditions.push(`(race_date IS NULL OR race_date >= CURRENT_DATE)`);
  }
  if (!filter.includeClosed) {
    conditions.push(`NOT ${REGISTRATION_CLOSED_SQL}`);
  }
  if (filter.distanceBucket) {
    conditions.push(DISTANCE_BUCKET_SQL[filter.distanceBucket]);
  }
  if (filter.dateFrom) {
    params.push(filter.dateFrom);
    conditions.push(`race_date >= $${params.length}`);
  }
  if (filter.dateTo) {
    params.push(filter.dateTo);
    conditions.push(`race_date <= $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = Math.max(1, filter.page);
  const offset = (page - 1) * PAGE_SIZE;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT ${RACE_COLUMNS}
         FROM marathon.marathon_race
         ${where}
        ORDER BY race_date ASC NULLS LAST, race_id ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PAGE_SIZE, offset]
    ),
    pool.query(`SELECT COUNT(*) FROM marathon.marathon_race ${where}`, params)
  ]);

  return { races: rows.map(mapRace), total: Number(countRows[0].count), page, pageSize: PAGE_SIZE };
}

// 서울을 맨 위에 고정하고 나머지는 가나다순으로 정렬한다(수도권 사용자가 대부분이라 자주 찾는
// "서울"을 지역 목록 맨 앞에 둔다).
export async function getMarathonRegions(): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT region, (region = '서울') AS is_seoul FROM marathon.marathon_race
      WHERE region IS NOT NULL AND region <> ''
      ORDER BY is_seoul DESC, region ASC`
  );
  return rows.map((r) => r.region);
}

export async function getMarathonRaceById(raceId: number): Promise<MarathonRace | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${RACE_COLUMNS}
       FROM marathon.marathon_race WHERE race_id = $1`,
    [raceId]
  );
  return rows[0] ? mapRace(rows[0]) : null;
}

export type MyReservation = {
  reservationId: string;
  raceId: number;
  status: 'PENDING' | 'WAITING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
  submittedAt: string;
};

// 여러 대회를 목록으로 보여줄 때 N+1 없이 내 신청 상태를 한 번에 조회하기 위한 맵.
export async function getMyReservationsForRaces(userId: string, raceIds: number[]): Promise<Map<number, MyReservation>> {
  if (raceIds.length === 0) return new Map();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT reservation_id, race_id, status, submitted_at
       FROM marathon.marathon_reservations
      WHERE user_id = $1 AND race_id = ANY($2::bigint[]) AND status <> 'CANCELLED'`,
    [userId, raceIds]
  );
  const map = new Map<number, MyReservation>();
  for (const row of rows) {
    map.set(Number(row.race_id), {
      reservationId: row.reservation_id,
      raceId: Number(row.race_id),
      status: row.status,
      submittedAt: row.submitted_at
    });
  }
  return map;
}

export type ApplyResult = 'ok' | 'already-applied' | 'not-open' | 'race-not-found';

// 실제 결제·정원 관리가 없는 MVP라서 신청 = DB row 생성이 전부다. race_id+user_id 유니크 제약을
// idempotency_key로도 그대로 사용해서(동일 사용자가 같은 대회에 중복 신청) 재시도해도 안전하다.
export async function applyToMarathon(userId: string, raceId: number): Promise<ApplyResult> {
  const pool = getPool();
  const race = await getMarathonRaceById(raceId);
  if (!race) return 'race-not-found';
  const status = getRegistrationStatus(race);
  if (status === 'CLOSED' || status === 'UPCOMING') return 'not-open';

  const { rows: userRows } = await pool.query(
    `SELECT real_name, nickname, user_email, gender, birth_year FROM auth_user.users WHERE user_id = $1`,
    [userId]
  );
  const applicant = userRows[0] ?? {};
  const applicantSnapshot = {
    realName: applicant.real_name ?? null,
    nickname: applicant.nickname ?? null,
    email: applicant.user_email ?? null,
    gender: applicant.gender ?? null,
    birthYear: applicant.birth_year ?? null
  };

  const idempotencyKey = `${userId}:${raceId}`;
  const { rows } = await pool.query(
    `INSERT INTO marathon.marathon_reservations (race_id, user_id, idempotency_key, applicant_snapshot)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (race_id, user_id) DO UPDATE
       SET status = 'PENDING', cancelled_at = NULL, applicant_snapshot = EXCLUDED.applicant_snapshot
       WHERE marathon.marathon_reservations.status = 'CANCELLED'
     RETURNING reservation_id`,
    [raceId, userId, idempotencyKey, JSON.stringify(applicantSnapshot)]
  );
  if (rows.length === 0) return 'already-applied';
  return 'ok';
}

// 독점 콜라보 대회는 취소로 CONFIRMED 자리가 비면, 대기열에서 가장 먼저 기다린 사람
// (queue_sequence_no가 가장 작은 WAITING)을 같은 트랜잭션 안에서 자동으로 승격시킨다.
// 그렇지 않으면 정원이 자리가 비어도 영영 채워지지 않는 채로 남는다. race 행 잠금은
// applyToExclusiveMarathon과 동일하게 동시 취소/신청이 몰려도 정원 계산이 어긋나지 않게 한다.
export async function cancelMarathonReservation(userId: string, raceId: number): Promise<boolean> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: raceRows } = await client.query(
      `SELECT is_exclusive_collab FROM marathon.marathon_race WHERE race_id = $1 FOR UPDATE`,
      [raceId]
    );
    if (raceRows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    // RETURNING은 UPDATE 이후 값을 돌려주므로, 취소 전 상태(CONFIRMED였는지)를 알려면
    // CTE로 먼저 잠가서 읽어둔 값을 같이 반환해야 한다 — status를 'CANCELLED'로 덮어쓴 뒤
    // RETURNING status를 그대로 쓰면 항상 'CANCELLED'만 나와 승격 조건이 절대 참이 될 수 없다.
    const { rows: cancelledRows } = await client.query(
      `WITH target AS (
         SELECT reservation_id, status FROM marathon.marathon_reservations
          WHERE race_id = $1 AND user_id = $2 AND status <> 'CANCELLED'
          FOR UPDATE
       )
       UPDATE marathon.marathon_reservations r
          SET status = 'CANCELLED', cancelled_at = now()
         FROM target
        WHERE r.reservation_id = target.reservation_id
        RETURNING target.status AS previous_status`,
      [raceId, userId]
    );
    if (cancelledRows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    if (raceRows[0].is_exclusive_collab && cancelledRows[0].previous_status === 'CONFIRMED') {
      await client.query(
        `UPDATE marathon.marathon_reservations
            SET status = 'CONFIRMED', confirmed_at = now(), queue_sequence_no = NULL
          WHERE reservation_id = (
            SELECT reservation_id FROM marathon.marathon_reservations
             WHERE race_id = $1 AND status = 'WAITING'
             ORDER BY queue_sequence_no ASC LIMIT 1 FOR UPDATE
          )`,
        [raceId]
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---- 독점 콜라보 대회: 접수창(정시 오픈) + 정원 기반 대기열 ----
//
// registration_windows는 기존 스키마에 있었지만 지금까지 아무 코드도 참조하지 않던 테이블이다.
// "정시 오픈" 티켓팅에는 date 단위의 registration_start/end_date로는 부족해서(같은 날 안에서도
// 초 단위로 승부가 갈림) opens_at/closes_at(timestamptz)을 여기서 처음 실제로 사용한다.

export type RegistrationWindow = {
  opensAt: string;
  closesAt: string;
  status: string;
};

export async function getRegistrationWindow(raceId: number): Promise<RegistrationWindow | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT opens_at, closes_at, status FROM marathon.marathon_registration_windows WHERE race_id = $1 LIMIT 1`,
    [raceId]
  );
  if (rows.length === 0) return null;
  return { opensAt: rows[0].opens_at, closesAt: rows[0].closes_at, status: rows[0].status };
}

export type RaceCapacityStatus = {
  capacity: number | null;
  confirmedCount: number;
  waitingCount: number;
};

// 목록/상세 페이지가 신청 버튼을 누르기 전에도 "몇 명 신청했는지"를 가볍게 보여줄 수 있게
// 별도 read-only 조회로 분리했다 — 이 조회는 락을 걸지 않으므로 대기 중인 사용자들이
// 자리를 확인하려고 계속 눌러봐도 무거운 신청 트랜잭션에 영향을 주지 않는다.
export async function getRaceCapacityStatus(raceId: number): Promise<RaceCapacityStatus> {
  const pool = getPool();
  const [{ rows: raceRows }, { rows: countRows }] = await Promise.all([
    pool.query(`SELECT capacity FROM marathon.marathon_race WHERE race_id = $1`, [raceId]),
    pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed_count,
          COUNT(*) FILTER (WHERE status = 'WAITING') AS waiting_count
         FROM marathon.marathon_reservations WHERE race_id = $1`,
      [raceId]
    )
  ]);
  return {
    capacity: raceRows[0]?.capacity !== null && raceRows[0]?.capacity !== undefined ? Number(raceRows[0].capacity) : null,
    confirmedCount: Number(countRows[0]?.confirmed_count ?? 0),
    waitingCount: Number(countRows[0]?.waiting_count ?? 0)
  };
}

async function buildApplicantSnapshot(userId: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT real_name, nickname, user_email, gender, birth_year FROM auth_user.users WHERE user_id = $1`,
    [userId]
  );
  const applicant = rows[0] ?? {};
  return {
    realName: applicant.real_name ?? null,
    nickname: applicant.nickname ?? null,
    email: applicant.user_email ?? null,
    gender: applicant.gender ?? null,
    birthYear: applicant.birth_year ?? null
  };
}

export type ExclusiveApplyResult =
  | { result: 'ok'; status: 'CONFIRMED' | 'WAITING'; queueSequenceNo: number | null }
  | { result: 'already-applied' }
  | { result: 'window-not-open' }
  | { result: 'race-not-found' };

// 정원이 있는 독점 콜라보 대회 전용 신청 처리. 스파이크 상황에서 동시에 수백 건이 몰려도
// 정원을 초과해서 CONFIRMED가 나가지 않도록, 같은 race 행에 대해 `SELECT ... FOR UPDATE`로
// 잠금을 걸어 이 함수를 부르는 모든 요청이 한 번에 하나씩만 카운트를 세고 삽입하게 만든다
// (DB 트랜잭션의 행 잠금만으로 별도 분산 락 없이 원자적으로 "정원 체크 + 배정"을 처리).
export async function applyToExclusiveMarathon(userId: string, raceId: number): Promise<ExclusiveApplyResult> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: raceRows } = await client.query(
      `SELECT capacity FROM marathon.marathon_race WHERE race_id = $1 FOR UPDATE`,
      [raceId]
    );
    if (raceRows.length === 0) {
      await client.query('ROLLBACK');
      return { result: 'race-not-found' };
    }
    const capacity = raceRows[0].capacity !== null ? Number(raceRows[0].capacity) : null;

    const { rows: windowRows } = await client.query(
      `SELECT opens_at, closes_at FROM marathon.marathon_registration_windows WHERE race_id = $1 LIMIT 1`,
      [raceId]
    );
    if (windowRows.length > 0) {
      const { opens_at, closes_at } = windowRows[0];
      const { rows: nowRows } = await client.query('SELECT now() AS now');
      const now = nowRows[0].now;
      if (now < opens_at || now > closes_at) {
        await client.query('ROLLBACK');
        return { result: 'window-not-open' };
      }
    }

    const { rows: existing } = await client.query(
      `SELECT 1 FROM marathon.marathon_reservations WHERE race_id = $1 AND user_id = $2 AND status <> 'CANCELLED'`,
      [raceId, userId]
    );
    if (existing.length > 0) {
      await client.query('ROLLBACK');
      return { result: 'already-applied' };
    }

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed_count,
              COUNT(*) FILTER (WHERE status = 'WAITING') AS waiting_count
         FROM marathon.marathon_reservations WHERE race_id = $1`,
      [raceId]
    );
    const confirmedCount = Number(countRows[0].confirmed_count);
    const waitingCount = Number(countRows[0].waiting_count);
    const hasRoom = capacity === null || confirmedCount < capacity;
    const status = hasRoom ? 'CONFIRMED' : 'WAITING';
    const queueSequenceNo = hasRoom ? null : waitingCount + 1;

    const applicantSnapshot = await buildApplicantSnapshot(userId);
    const idempotencyKey = `${userId}:${raceId}`;
    const confirmedAt = status === 'CONFIRMED' ? new Date() : null;
    await client.query(
      `INSERT INTO marathon.marathon_reservations
         (race_id, user_id, idempotency_key, status, queue_sequence_no, applicant_snapshot, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (race_id, user_id) DO UPDATE
         SET status = EXCLUDED.status, queue_sequence_no = EXCLUDED.queue_sequence_no,
             cancelled_at = NULL, applicant_snapshot = EXCLUDED.applicant_snapshot,
             confirmed_at = EXCLUDED.confirmed_at
         WHERE marathon.marathon_reservations.status = 'CANCELLED'`,
      [raceId, userId, idempotencyKey, status, queueSequenceNo, JSON.stringify(applicantSnapshot), confirmedAt]
    );

    await client.query('COMMIT');
    return { result: 'ok', status, queueSequenceNo };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
