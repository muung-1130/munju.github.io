// 마이페이지 "보유 러닝화" 섹션 데모용 시드. shoe.user_shoes/shoe_life_snapshots/shoe_wear_analyses가
// 전부 비어있어서(0건) admin 계정에 실사용 예시를 넣어둔다.
//   - Nike Pegasus 41: 교체 권장일이 며칠 안 남은 케이스(D-day 임박 데모) + 마모도 분석 2건
//   - Adidas Adizero SL 2: 아직 여유 있는 케이스
//   - Asics Gel Cumulus 26: RETIRED + 수명 예측 정보 없음(빈 상태 데모)
import { Client } from 'pg';

const client = new Client();
await client.connect();

const { rows: adminRows } = await client.query(`SELECT user_id FROM auth_user.users WHERE user_name = 'admin'`);
const adminId = adminRows[0].user_id;

async function addShoe({ shoeModelId, nickname, purchaseDate, firstUsedAt, accumulatedDistanceM, status, retiredAt }) {
  const { rows } = await client.query(
    `INSERT INTO shoe.user_shoes
       (user_id, shoe_model_id, nickname, purchase_date, first_used_at, initial_distance_m, accumulated_distance_m, status, retired_at)
     VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)
     RETURNING user_shoe_id`,
    [adminId, shoeModelId, nickname, purchaseDate, firstUsedAt, accumulatedDistanceM, status, retiredAt]
  );
  return rows[0].user_shoe_id;
}

async function addLifeSnapshot(userShoeId, { accumulatedDistanceM, remainingDistanceM, remainingDays, recommendedAt, probability }) {
  await client.query(
    `INSERT INTO shoe.shoe_life_snapshots
       (user_shoe_id, accumulated_distance_m, estimated_remaining_distance_m, estimated_remaining_days,
        replacement_recommended_at, replacement_probability, prediction_model_version)
     VALUES ($1, $2, $3, $4, $5, $6, 'v1-demo')`,
    [userShoeId, accumulatedDistanceM, remainingDistanceM, remainingDays, recommendedAt, probability]
  );
}

async function addWearAnalysis(userShoeId, { status, wearScore, heel, forefoot, outsole, requestedAt, completedAt }) {
  await client.query(
    `INSERT INTO shoe.shoe_wear_analyses
       (user_shoe_id, input_media_id, status, wear_score, heel_wear_score, forefoot_wear_score, outsole_wear_score, requested_at, completed_at)
     VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6, $7, $8)`,
    [userShoeId, status, wearScore, heel, forefoot, outsole, requestedAt, completedAt]
  );
}

// 1) Nike Pegasus 41 — 교체 임박
const pegasusId = await addShoe({
  shoeModelId: 116,
  nickname: '평일 러닝화',
  purchaseDate: '2026-03-10',
  firstUsedAt: '2026-03-12',
  accumulatedDistanceM: 452000,
  status: 'ACTIVE',
  retiredAt: null
});
await addLifeSnapshot(pegasusId, {
  accumulatedDistanceM: 452000,
  remainingDistanceM: 28000,
  remainingDays: 5,
  recommendedAt: '2026-07-23',
  probability: 82.5
});
await addWearAnalysis(pegasusId, {
  status: 'COMPLETED', wearScore: 78.2, heel: 82.0, forefoot: 71.5, outsole: 80.0,
  requestedAt: '2026-06-01T09:00:00+09:00', completedAt: '2026-06-01T09:03:00+09:00'
});
await addWearAnalysis(pegasusId, {
  status: 'COMPLETED', wearScore: 65.0, heel: 68.0, forefoot: 60.0, outsole: 66.5,
  requestedAt: '2026-05-01T09:00:00+09:00', completedAt: '2026-05-01T09:02:30+09:00'
});

// 2) Adidas Adizero SL 2 — 아직 여유
const adizeroId = await addShoe({
  shoeModelId: 118,
  nickname: '스피드 훈련화',
  purchaseDate: '2026-06-20',
  firstUsedAt: '2026-06-22',
  accumulatedDistanceM: 118000,
  status: 'ACTIVE',
  retiredAt: null
});
await addLifeSnapshot(adizeroId, {
  accumulatedDistanceM: 118000,
  remainingDistanceM: 382000,
  remainingDays: 96,
  recommendedAt: '2026-10-22',
  probability: 12.0
});

// 3) Asics Gel Cumulus 26 — 은퇴, 수명 예측 정보 없음
await addShoe({
  shoeModelId: 120,
  nickname: null,
  purchaseDate: '2025-11-01',
  firstUsedAt: '2025-11-03',
  accumulatedDistanceM: 712000,
  status: 'RETIRED',
  retiredAt: '2026-05-15T00:00:00+09:00'
});

console.log('user shoes seeded:', { pegasusId, adizeroId });
await client.end();
