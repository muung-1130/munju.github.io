import { getPool } from './db.js';
import { defaultWeightKgForGender, estimateCaloriesKcal } from './calorie.js';
import { writeRunCompletedOutboxEvent } from './outbox.js';

export type CourseRouteInfo = {
  courseId: string;
  courseName: string;
  distanceM: number;
  positions: [number, number][];
};

// /run/[courseId] 화면이 뜰 때 지도에 그릴 코스 경로. course.courses.route_geom은 도보 경로로
// 촘촘히 보간되어 있어(코스당 수백~수천 포인트) 이 폴리라인 자체를 GPS 스냅 기준선으로 쓴다.
export async function getCourseRouteForRun(courseId: string): Promise<CourseRouteInfo | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT course_id, course_name, distance_m, ST_AsGeoJSON(route_geom) AS route_geojson
       FROM course.courses WHERE course_id = $1 AND deleted_at IS NULL`,
    [courseId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const geojson = row.route_geojson ? JSON.parse(row.route_geojson) : null;
  return {
    courseId: row.course_id,
    courseName: row.course_name,
    distanceM: row.distance_m ?? 0,
    positions: (geojson?.coordinates ?? []).map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
  };
}

// 출발 버튼 = running_record.runs 행 생성. my_shoe_id는 이번 화면에서 신발을 고르지 않으므로 NULL로 둔다.
// courseId가 없으면(자율 달리기) course_id는 NULL로 저장한다 — running_record.runs.course_id는
// 원래 nullable 컬럼이라 스키마 변경 없이 지원 가능하다.
export async function startRun(userId: string, courseId: string | null): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO running_record.runs (user_id, course_id, my_shoe_id, source_type, status, started_at)
     VALUES ($1, $2, NULL, 'APP', 'IN_PROGRESS', now())
     RETURNING run_id`,
    [userId, courseId]
  );
  return rows[0].run_id;
}

export type RunSampleInput = {
  lat: number;
  lng: number;
  recordedAt: string;
  paceSecPerKm: number | null;
  accuracyM: number | null;
  speedMps: number | null;
};

// 30초 안팎으로 버퍼링해서 배치로 저장한다(클라이언트에서 호출 주기를 조절). 소유자 확인 후,
// 지금까지 쌓인 시퀀스 번호 다음부터 이어서 넣는다.
export async function saveRunSamples(runId: string, userId: string, samples: RunSampleInput[]): Promise<void> {
  if (samples.length === 0) return;
  const pool = getPool();
  const { rows: ownerRows } = await pool.query(`SELECT 1 FROM running_record.runs WHERE run_id = $1 AND user_id = $2`, [runId, userId]);
  if (ownerRows.length === 0) throw new Error('본인 러닝 기록이 아니에요.');

  const { rows: seqRows } = await pool.query(
    `SELECT COALESCE(MAX(sequence_no), 0) AS max_seq FROM running_record.run_samples WHERE run_id = $1`,
    [runId]
  );
  let seq = Number(seqRows[0].max_seq);

  const valueClauses: string[] = [];
  const params: unknown[] = [];
  for (const s of samples) {
    seq += 1;
    const base = params.length;
    valueClauses.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, ST_SetSRID(ST_MakePoint($${base + 4}, $${base + 5}), 4326), $${base + 6}, $${base + 7}, $${base + 8})`
    );
    params.push(runId, seq, s.recordedAt, s.lng, s.lat, s.paceSecPerKm, s.accuracyM, s.speedMps);
  }

  await pool.query(
    `INSERT INTO running_record.run_samples (run_id, sequence_no, recorded_at, location, pace_sec_per_km, accuracy_m, speed_mps)
     VALUES ${valueClauses.join(', ')}`,
    params
  );
}

export type FinishRunInput = {
  status: 'COMPLETED' | 'STOPPED';
  sourceType: 'APP' | 'MANUAL';
  distanceM: number;
  durationSec: number;
  movingDurationSec: number;
  avgPaceSecPerKm: number | null;
  bestPaceSecPerKm: number | null;
  routePositions: [number, number][];
  myShoeId: string | null;
};

export async function finishRun(runId: string, userId: string, input: FinishRunInput): Promise<void> {
  const pool = getPool();

  // 이동 거리가 0m인 STOPPED 기록(GPS가 한 번도 안 잡혔거나 출발하자마자 종료한 경우)은 남겨봐야
  // 의미가 없는 빈 기록이라, 그냥 취소(CANCELLED)로 남긴다.
  if (input.status === 'STOPPED' && input.distanceM <= 0) {
    await cancelRun(runId, userId);
    return;
  }

  const routeGeom =
    input.routePositions.length >= 2
      ? `SRID=4326;LINESTRING(${input.routePositions.map(([lat, lng]) => `${lng} ${lat}`).join(',')})`
      : null;

  // 클라이언트가 보낸 my_shoe_id가 실제로 이 사용자 소유의 신발인지 확인 없이 그대로 저장하면
  // 다른 사용자의 신발 ID를 넣는 것도 가능해지므로(IDOR), 서버에서 소유권을 검증한다.
  let myShoeId: string | null = null;
  if (input.myShoeId) {
    const { rows: shoeRows } = await pool.query(`SELECT 1 FROM shoe.user_shoes WHERE user_shoe_id = $1 AND user_id = $2`, [
      input.myShoeId,
      userId
    ]);
    if (shoeRows.length > 0) myShoeId = input.myShoeId;
  }

  // 칼로리는 심박수 센서가 없어 체중 기반 근사치로 추정한다 — 체중을 아예 입력한 적 없는
  // 사용자는 성별 평균으로 대체한다(회원가입 때 이미 채워지지만 과거 계정 대비 방어적으로 처리).
  const { rows: userRows } = await pool.query(`SELECT weight_kg, gender FROM auth_user.users WHERE user_id = $1`, [userId]);
  const weightKg = userRows[0]?.weight_kg !== null && userRows[0]?.weight_kg !== undefined
    ? Number(userRows[0].weight_kg)
    : defaultWeightKgForGender(userRows[0]?.gender ?? null);
  const caloriesKcal = estimateCaloriesKcal(input.distanceM, weightKg);

  // runs UPDATE와 RunCompleted outbox 적재를 같은 트랜잭션으로 묶는다(Outbox 패턴) — 둘 중
  // 하나만 커밋되는 상황(예: 커밋 직후 프로세스가 죽어 Kafka 발행을 놓치는 것)을 없애기 위해서다.
  // 실제 Kafka 발행은 이 트랜잭션 밖, 별도 outboxPublisher가 이 행을 폴링해서 담당한다.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: updatedRows } = await client.query(
      `UPDATE running_record.runs
          SET status = $3, source_type = $4, completed_at = now(),
              duration_sec = $5, moving_duration_sec = $6, distance_m = $7,
              average_pace_sec_per_km = $8, best_pace_sec_per_km = $9,
              route_geom = CASE WHEN $10::text IS NULL THEN NULL ELSE ST_GeomFromEWKT($10) END,
              calories_kcal = $11, my_shoe_id = $12
        WHERE run_id = $1 AND user_id = $2 AND status = 'IN_PROGRESS'
        RETURNING run_id, course_id, my_shoe_id, source_type, started_at, completed_at, created_at,
                  distance_m, duration_sec, moving_duration_sec, average_pace_sec_per_km,
                  best_pace_sec_per_km, average_heart_rate, max_heart_rate, average_cadence,
                  calories_kcal, elevation_gain_m`,
      [
        runId,
        userId,
        input.status,
        input.sourceType,
        input.durationSec,
        input.movingDurationSec,
        input.distanceM,
        input.avgPaceSecPerKm,
        input.bestPaceSecPerKm,
        routeGeom,
        caloriesKcal,
        myShoeId
      ]
    );
    if (updatedRows.length === 0) throw new Error('러닝 기록을 찾을 수 없거나 이미 종료됐어요.');

    // 챌린지 진행도/크루 배틀 갱신/AI 코치 축하 메시지는 이 서비스(running_record) 소유가 아니라
    // Kafka 이벤트로만 흘려보낸다 — 완주(COMPLETED)한 경우만 대상으로 한다(STOPPED는 중도 종료라
    // 챌린지 달성으로 인정하지 않는다).
    if (input.status === 'COMPLETED') {
      const row = updatedRows[0];
      await writeRunCompletedOutboxEvent(client, {
        runId: row.run_id,
        userId,
        courseId: row.course_id,
        myShoeId: row.my_shoe_id,
        sourceType: row.source_type,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        createdAt: row.created_at,
        distanceM: row.distance_m,
        durationSec: row.duration_sec,
        movingDurationSec: row.moving_duration_sec,
        averagePaceSecPerKm: row.average_pace_sec_per_km,
        bestPaceSecPerKm: row.best_pace_sec_per_km,
        averageHeartRate: row.average_heart_rate,
        maxHeartRate: row.max_heart_rate,
        averageCadence: row.average_cadence,
        caloriesKcal: row.calories_kcal,
        elevationGainM: row.elevation_gain_m !== null ? Number(row.elevation_gain_m) : null
      });
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function cancelRun(runId: string, userId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE running_record.runs SET status = 'CANCELLED', completed_at = now()
      WHERE run_id = $1 AND user_id = $2 AND status = 'IN_PROGRESS'`,
    [runId, userId]
  );
}
