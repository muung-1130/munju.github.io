// "우리 서비스의 모든 것을 체험"할 수 있는 데모 계정 kevin(비밀번호: k8spass#)을 만들고, 꽤 열심히
// 활동하는 러너 컨셉으로 데이터를 채운다.
//   - 러닝 선호도(user_running_preferences)는 넣지 않는다.
//   - 러닝크루에는 가입시키지 않는다.
//   - 러닝화는 1개만, 사진 분석 결과(shoe_wear_analyses) 1건과 함께 넣는다.
//   - 지난 9주간의 누적 러닝 기록 + 이번 주 실제 러닝 2건(페이스 마스터/주간 5K 완주 챌린지 조건을
//     실제로 충족하는 기록)을 넣고, 두 공개 챌린지 참여도 실제 진행도 계산으로 반영한다.
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { loadEnvFile } from './lib/load-env.mjs';

loadEnvFile(new URL('../.env', import.meta.url));

const client = new Client({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE
});
await client.connect();

const COURSE_IDS = ['SEOUL_C001', 'SEOUL_C002', 'SEOUL_C003', 'SEOUL_C004', 'SEOUL_C005', 'SEOUL_C006'];
const SHOE_MODEL_ID = 126; // Hoka Clifton 10

// --- 1) 계정 생성 (이미 있으면 재사용) ---------------------------------------------------------
const passwordHash = await bcrypt.hash('k8spass#', 10);
const { rows: existing } = await client.query(`SELECT user_id FROM auth_user.users WHERE user_name = 'kevin'`);
let userId;
if (existing.length > 0) {
  userId = existing[0].user_id;
  await client.query(`UPDATE auth_user.users SET user_password = $1 WHERE user_id = $2`, [passwordHash, userId]);
  console.log('기존 kevin 계정 비밀번호 갱신:', userId);
} else {
  const { rows } = await client.query(
    `INSERT INTO auth_user.users (user_name, user_email, gender, birth_year, dong, nickname, real_name, weight_kg, status, user_password)
     VALUES ('kevin', 'kevin.runner@example.com', 'M', 1992, '서울특별시 강남구 역삼1동', '케빈러너', '케빈', 72, 'ACTIVE', $1)
     RETURNING user_id`,
    [passwordHash]
  );
  userId = rows[0].user_id;
  console.log('kevin 계정 생성:', userId);
}

// --- 2) 러닝화 1개 + 마모도 분석 1건 -----------------------------------------------------------
function kstToUtcIso(y, m, d, hh, mm) {
  return new Date(Date.UTC(y, m - 1, d, hh - 9, mm)).toISOString();
}

async function insertRun({ courseId, startedAtIso, distanceM, avgPaceSecPerKm, myShoeId }) {
  const durationSec = Math.round((distanceM / 1000) * avgPaceSecPerKm);
  const movingDurationSec = Math.round(durationSec * 0.96);
  const completedAtIso = new Date(new Date(startedAtIso).getTime() + durationSec * 1000).toISOString();
  const { rows } = await client.query(
    `INSERT INTO running_record.runs
       (user_id, course_id, my_shoe_id, source_type, status, started_at, completed_at, created_at,
        duration_sec, moving_duration_sec, distance_m, average_pace_sec_per_km, best_pace_sec_per_km,
        average_heart_rate, max_heart_rate, average_cadence, calories_kcal, elevation_gain_m)
     VALUES ($1,$2,$3,'APP','COMPLETED',$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING run_id, started_at, completed_at, distance_m, average_pace_sec_per_km`,
    [
      userId,
      courseId,
      myShoeId,
      startedAtIso,
      completedAtIso,
      durationSec,
      movingDurationSec,
      distanceM,
      avgPaceSecPerKm,
      Math.round(avgPaceSecPerKm * 0.92),
      142 + Math.round(Math.random() * 14),
      165 + Math.round(Math.random() * 14),
      168 + Math.round(Math.random() * 10),
      Math.round((distanceM / 1000) * 62),
      Math.round((distanceM / 1000) * 4 + Math.random() * 8)
    ]
  );
  return rows[0];
}

// 지난 9주(이번 주 제외), 주 2~3회 — 평일 아침/저녁 짧은 러닝 + 주말 장거리.
const HISTORY_RUNS = [
  { weeksAgo: 9, dow: 1, hh: 6, mm: 30, distanceKm: 6.2, pace: 335 },
  { weeksAgo: 9, dow: 4, hh: 19, mm: 30, distanceKm: 5.0, pace: 350 },
  { weeksAgo: 9, dow: 6, hh: 7, mm: 0, distanceKm: 12.4, pace: 320 },
  { weeksAgo: 8, dow: 2, hh: 6, mm: 20, distanceKm: 5.5, pace: 340 },
  { weeksAgo: 8, dow: 5, hh: 19, mm: 0, distanceKm: 7.0, pace: 310 },
  { weeksAgo: 8, dow: 0, hh: 8, mm: 0, distanceKm: 14.0, pace: 325 },
  { weeksAgo: 7, dow: 1, hh: 6, mm: 30, distanceKm: 5.8, pace: 330 },
  { weeksAgo: 7, dow: 3, hh: 19, mm: 30, distanceKm: 4.5, pace: 355 },
  { weeksAgo: 7, dow: 6, hh: 7, mm: 0, distanceKm: 11.0, pace: 315 },
  { weeksAgo: 6, dow: 2, hh: 6, mm: 15, distanceKm: 6.0, pace: 328 },
  { weeksAgo: 6, dow: 5, hh: 19, mm: 0, distanceKm: 8.2, pace: 300 },
  { weeksAgo: 6, dow: 0, hh: 7, mm: 30, distanceKm: 15.0, pace: 322 },
  { weeksAgo: 5, dow: 1, hh: 6, mm: 30, distanceKm: 5.4, pace: 340 },
  { weeksAgo: 5, dow: 4, hh: 19, mm: 30, distanceKm: 6.6, pace: 318 },
  { weeksAgo: 5, dow: 6, hh: 7, mm: 0, distanceKm: 13.2, pace: 320 },
  { weeksAgo: 4, dow: 2, hh: 6, mm: 20, distanceKm: 5.0, pace: 345 },
  { weeksAgo: 4, dow: 3, hh: 19, mm: 0, distanceKm: 7.5, pace: 305 },
  { weeksAgo: 4, dow: 0, hh: 8, mm: 0, distanceKm: 16.1, pace: 330 },
  { weeksAgo: 3, dow: 1, hh: 6, mm: 30, distanceKm: 6.0, pace: 325 },
  { weeksAgo: 3, dow: 5, hh: 19, mm: 30, distanceKm: 5.2, pace: 338 },
  { weeksAgo: 3, dow: 6, hh: 7, mm: 0, distanceKm: 12.8, pace: 318 },
  { weeksAgo: 2, dow: 2, hh: 6, mm: 15, distanceKm: 6.4, pace: 320 },
  { weeksAgo: 2, dow: 4, hh: 19, mm: 0, distanceKm: 7.8, pace: 295 },
  { weeksAgo: 2, dow: 0, hh: 7, mm: 30, distanceKm: 14.6, pace: 315 },
  { weeksAgo: 1, dow: 1, hh: 6, mm: 30, distanceKm: 6.6, pace: 315 },
  { weeksAgo: 1, dow: 3, hh: 19, mm: 30, distanceKm: 5.6, pace: 330 },
  { weeksAgo: 1, dow: 6, hh: 7, mm: 0, distanceKm: 13.6, pace: 312 }
];

function dateForWeeksAgoDow(weeksAgo, dow) {
  // dow: 0=일 ... 6=토. 오늘(KST) 기준 이번 주 월요일에서 (weeksAgo*7)일 전 주의 dow 날짜를 구한다.
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayDow = nowKst.getUTCDay();
  const daysSinceMonday = todayDow === 0 ? 6 : todayDow - 1;
  const thisMondayKst = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() - daysSinceMonday));
  const targetMondayKst = new Date(thisMondayKst.getTime() - weeksAgo * 7 * 24 * 60 * 60 * 1000);
  const offsetFromMonday = dow === 0 ? 6 : dow - 1;
  const targetDateKst = new Date(targetMondayKst.getTime() + offsetFromMonday * 24 * 60 * 60 * 1000);
  return {
    y: targetDateKst.getUTCFullYear(),
    m: targetDateKst.getUTCMonth() + 1,
    d: targetDateKst.getUTCDate()
  };
}

// 러닝화보다 먼저 만들어야 러닝 기록에 my_shoe_id로 연결할 수 있다. 정확한 누적거리는 아래 기록을
// 다 넣은 뒤 합산해서 갱신한다.
const firstHistoryDate = dateForWeeksAgoDow(9, 1);
const { rows: shoeRows } = await client.query(
  `INSERT INTO shoe.user_shoes (user_id, shoe_model_id, nickname, purchase_date, first_used_at, accumulated_distance_m, status)
   VALUES ($1, $2, '데일리 러닝화', $3, $3, 0, 'ACTIVE')
   RETURNING user_shoe_id`,
  [userId, SHOE_MODEL_ID, `${firstHistoryDate.y}-${String(firstHistoryDate.m).padStart(2, '0')}-${String(firstHistoryDate.d).padStart(2, '0')}`]
);
const userShoeId = shoeRows[0].user_shoe_id;
console.log('러닝화 등록:', userShoeId);

let totalDistanceM = 0;
for (const r of HISTORY_RUNS) {
  const { y, m, d } = dateForWeeksAgoDow(r.weeksAgo, r.dow);
  const run = await insertRun({
    courseId: COURSE_IDS[Math.floor(Math.random() * COURSE_IDS.length)],
    startedAtIso: kstToUtcIso(y, m, d, r.hh, r.mm),
    distanceM: Math.round(r.distanceKm * 1000),
    avgPaceSecPerKm: r.pace,
    myShoeId: userShoeId
  });
  totalDistanceM += run.distance_m;
}
console.log(`과거 러닝 기록 ${HISTORY_RUNS.length}건 시드 (누적 ${(totalDistanceM / 1000).toFixed(1)}km)`);

// 임의의 사진 데이터를 분석했다고 가정한 마모도 분석 결과 — 기존 시드 스크립트(seed-user-shoes.mjs)와
// 동일하게 input_media_id는 실제 media_objects 없이 논리 참조용 UUID만 남긴다.
const wearScore = Math.min(70, 20 + totalDistanceM / 1000 / 3);
await client.query(
  `INSERT INTO shoe.shoe_wear_analyses
     (user_shoe_id, input_media_id, status, wear_score, heel_wear_score, forefoot_wear_score, outsole_wear_score, requested_at, completed_at)
   VALUES ($1, gen_random_uuid(), 'COMPLETED', $2, $3, $4, $5, now(), now())`,
  [userShoeId, wearScore.toFixed(1), (wearScore * 1.05).toFixed(1), (wearScore * 0.9).toFixed(1), (wearScore * 1.0).toFixed(1)]
);

// --- 3) 이번 주 공개 챌린지 2개 참여 + 실제 러닝 기록으로 진행도 반영 -------------------------------
const { rows: seriesRows } = await client.query(
  `SELECT * FROM challenge.challenge_series WHERE name IN ('주간 5K 완주 챌린지', '페이스 마스터 5''00"')`
);
const seriesByName = new Map(seriesRows.map((s) => [s.name, s]));

const challengeIdBySeriesId = new Map();
for (const s of seriesRows) {
  const { rows } = await client.query(
    `SELECT challenge_id FROM challenge.challenges WHERE series_id = $1 AND status = 'ACTIVE' ORDER BY start_at DESC LIMIT 1`,
    [s.series_id]
  );
  challengeIdBySeriesId.set(s.series_id, rows[0].challenge_id);
}

for (const s of seriesRows) {
  const challengeId = challengeIdBySeriesId.get(s.series_id);
  await client.query(
    `INSERT INTO challenge.challenge_participations (challenge_id, user_id, status, progress_value, progress_ratio)
     VALUES ($1, $2, 'ACTIVE', 0, 0)
     ON CONFLICT (challenge_id, user_id) WHERE user_id IS NOT NULL DO NOTHING`,
    [challengeId, userId]
  );
}
console.log('공개 챌린지 참여 등록: 주간 5K 완주 챌린지, 페이스 마스터 5\'00"');

const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
const todayDow = nowKst.getUTCDay();
const daysSinceMonday = todayDow === 0 ? 6 : todayDow - 1;
const thisMondayKst = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() - daysSinceMonday));
const y = thisMondayKst.getUTCFullYear();
const mo = thisMondayKst.getUTCMonth() + 1;
const mondayDay = thisMondayKst.getUTCDate();
const tuesdayDay = mondayDay + 1;

// 월요일 06:30 — 6.0km, 4'50"/km (5K 완주 최소거리 충족 + 페이스마스터 목표(5'00"=300초) 충족)
const mondayRun = await insertRun({
  courseId: COURSE_IDS[0],
  startedAtIso: kstToUtcIso(y, mo, mondayDay, 6, 30),
  distanceM: 6000,
  avgPaceSecPerKm: 290,
  myShoeId: userShoeId
});
console.log('이번 주 월요일 러닝 시드:', mondayRun.run_id);

// 화요일(오늘) 저녁 — 5.5km, 4'55"/km (5K 완주 누적에 더해짐)
const tuesdayRun = await insertRun({
  courseId: COURSE_IDS[1],
  startedAtIso: kstToUtcIso(y, mo, tuesdayDay, 19, 0),
  distanceM: 5500,
  avgPaceSecPerKm: 295,
  myShoeId: userShoeId
});
console.log('이번 주 화요일 러닝 시드:', tuesdayRun.run_id);

async function applyProgress(seriesName, run, { incrementOverride } = {}) {
  const s = seriesByName.get(seriesName);
  const challengeId = challengeIdBySeriesId.get(s.series_id);
  const { rows: partRows } = await client.query(
    `SELECT participation_id, progress_value FROM challenge.challenge_participations WHERE challenge_id = $1 AND user_id = $2`,
    [challengeId, userId]
  );
  if (partRows.length === 0) return;
  const participationId = partRows[0].participation_id;
  const progressBefore = Number(partRows[0].progress_value);
  const targetValue = Number(s.target_value);

  const progressAfter = incrementOverride !== undefined ? Math.max(progressBefore, incrementOverride) : progressBefore + run.distance_m / 1000;
  if (progressAfter === progressBefore) return;

  await client.query(
    `INSERT INTO challenge.challenge_progress_events
       (participation_id, source_event_id, run_id, increment_value, progress_before, progress_after, occurred_at)
     VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6)`,
    [participationId, run.run_id, progressAfter - progressBefore, progressBefore, progressAfter, run.completed_at]
  );
  const ratio = Math.min(100, (progressAfter / targetValue) * 100);
  const isNowComplete = progressAfter >= targetValue;
  await client.query(
    `UPDATE challenge.challenge_participations
        SET progress_value = $2, progress_ratio = $3,
            status = CASE WHEN $4 THEN 'COMPLETED' ELSE status END,
            completed_at = CASE WHEN $4 THEN now() ELSE completed_at END
      WHERE participation_id = $1`,
    [participationId, progressAfter, ratio, isNowComplete]
  );
}

// 월요일 6.0km/4'50" — 5K 완주 누적(+6.0km)에 반영 + 페이스마스터 목표(300초) 즉시 달성
await applyProgress('주간 5K 완주 챌린지', mondayRun);
await applyProgress('페이스 마스터 5\'00"', mondayRun, { incrementOverride: 300 });

// 화요일 5.5km/4'55" — 5K 완주 누적에 추가 반영(페이스마스터는 이미 완주라 더 반영할 것 없음)
await applyProgress('주간 5K 완주 챌린지', tuesdayRun);

// 러닝화 누적거리는 이 신발로 뛴 모든 기록(과거+이번 주)의 합으로 마지막에 한 번에 맞춘다.
await client.query(
  `UPDATE shoe.user_shoes
      SET accumulated_distance_m = (
        SELECT COALESCE(SUM(r.distance_m), 0) FROM running_record.runs r WHERE r.my_shoe_id = user_shoes.user_shoe_id
      )
    WHERE user_shoe_id = $1`,
  [userShoeId]
);

console.log('완료');
await client.end();
