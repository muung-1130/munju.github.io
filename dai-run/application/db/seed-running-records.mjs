// running_record.runs에 데모용 러닝 기록을 시드한다 (team4가 만든 실제 테이블, user_id는 UUID).
// 대상 계정: qwerie8899@gmail.com (old bigint user_id=3) → auth_user.user_id_migration_map으로 확인한
// UUID f22fb629-abfc-4443-bd0d-5bdf418ce22b. 아직 "기록 남기기" 기능이 없어 실사용자 기록이 0건이라
// 홈페이지 "나의 러닝 요약"을 실감나게 보여주기 위한 일회성 데모 데이터다.
// 실행: node db/seed-running-records.mjs

import { Client } from 'pg';
import { loadEnvFile } from './lib/load-env.mjs';

loadEnvFile(new URL('../.env', import.meta.url));

const TARGET_USER_ID = 'f22fb629-abfc-4443-bd0d-5bdf418ce22b';

const COURSE_IDS = ['SEOUL_C001', 'SEOUL_C002', 'SEOUL_C003', 'SEOUL_C004', 'SEOUL_C005', 'SEOUL_C006'];

function daysAgo(n, hour) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return d;
}

function buildRun(distanceKm, paceSecPerKm, daysBack, hour) {
  const distanceM = Math.round(distanceKm * 1000);
  const durationSec = Math.round(distanceKm * paceSecPerKm);
  const movingDurationSec = Math.round(durationSec * 0.95);
  const startedAt = daysAgo(daysBack, hour);
  const completedAt = new Date(startedAt.getTime() + durationSec * 1000);

  return {
    courseId: COURSE_IDS[Math.floor(Math.random() * COURSE_IDS.length)],
    sourceType: 'APP',
    status: 'COMPLETED',
    startedAt,
    completedAt,
    durationSec,
    movingDurationSec,
    distanceM,
    averagePaceSecPerKm: paceSecPerKm,
    bestPaceSecPerKm: Math.round(paceSecPerKm * 0.9),
    averageHeartRate: 138 + Math.round(Math.random() * 12),
    maxHeartRate: 160 + Math.round(Math.random() * 15),
    averageCadence: 165 + Math.round(Math.random() * 10),
    caloriesKcal: Math.round(distanceKm * 62),
    elevationGainM: Math.round(distanceKm * 4 + Math.random() * 10)
  };
}

const runs = [
  buildRun(5.2, 340, 1, 7),
  buildRun(3.8, 355, 3, 19),
  buildRun(8.1, 330, 5, 6),
  buildRun(4.5, 345, 8, 19),
  buildRun(6.0, 325, 10, 7),
  buildRun(10.2, 350, 13, 6),
  buildRun(3.2, 360, 16, 20),
  buildRun(7.4, 335, 19, 7)
];

async function main() {
  const client = new Client({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE
  });
  await client.connect();

  try {
    for (const run of runs) {
      await client.query(
        `INSERT INTO running_record.runs
           (user_id, course_id, source_type, status, started_at, completed_at, duration_sec,
            moving_duration_sec, distance_m, average_pace_sec_per_km, best_pace_sec_per_km,
            average_heart_rate, max_heart_rate, average_cadence, calories_kcal, elevation_gain_m)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          TARGET_USER_ID,
          run.courseId,
          run.sourceType,
          run.status,
          run.startedAt,
          run.completedAt,
          run.durationSec,
          run.movingDurationSec,
          run.distanceM,
          run.averagePaceSecPerKm,
          run.bestPaceSecPerKm,
          run.averageHeartRate,
          run.maxHeartRate,
          run.averageCadence,
          run.caloriesKcal,
          run.elevationGainM
        ]
      );
    }
    console.log(`${runs.length}건의 데모 러닝 기록을 저장했어요.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
