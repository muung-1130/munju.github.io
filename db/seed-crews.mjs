// 러닝크루 페이지 DB 연동 테스트용 데이터: admin 계정의 러닝 선호도를 실제 running_record.runs
// 통계에 맞춰 채우고, 그 조건에 맞는 크루 1개 + 안 맞는 크루 1개를 만든다.
import { Client } from 'pg';
import { loadEnvFile } from './lib/load-env.mjs';

loadEnvFile(new URL('../.env', import.meta.url));

const ADMIN_UUID = '93d738ca-c62d-4e2f-a400-c362e405ec39';

const client = new Client({
  host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER,
  password: process.env.PGPASSWORD, database: process.env.PGDATABASE
});
await client.connect();

try {
  await client.query('BEGIN');

  // admin의 실제 최근 기록(평균 거리 약 6km, 평균 페이스 약 340초/km, 주당 약 18km) 기준으로 선호도 채움.
  await client.query(
    `INSERT INTO auth_user.user_running_preferences
       (user_id, difficulty, running_goal, preferred_distance_m, target_pace_sec_per_km,
        weekly_target_distance_m, preferred_surface, preferred_scenery, max_preferred_slope_pct, resting_heart_rate)
     VALUES ($1, 'INTERMEDIATE', 'HEALTH', 6000, 340, 18000, 'ROAD', '한강', 3.0, 62)
     ON CONFLICT (user_id) DO UPDATE SET
       difficulty = EXCLUDED.difficulty, running_goal = EXCLUDED.running_goal,
       preferred_distance_m = EXCLUDED.preferred_distance_m, target_pace_sec_per_km = EXCLUDED.target_pace_sec_per_km,
       weekly_target_distance_m = EXCLUDED.weekly_target_distance_m, preferred_surface = EXCLUDED.preferred_surface,
       preferred_scenery = EXCLUDED.preferred_scenery, max_preferred_slope_pct = EXCLUDED.max_preferred_slope_pct,
       resting_heart_rate = EXCLUDED.resting_heart_rate, updated_at = now()`,
    [ADMIN_UUID]
  );
  console.log('admin user_running_preferences 저장 완료');

  // 크루 A: admin 조건(거리 6km, 페이스 340초/km, 주 3회, 종로구)에 맞는 크루
  const crewA = await client.query(
    `INSERT INTO crew.crews
       (owner_user_id, crew_name, description, region_code, meeting_location,
        target_distance_min_m, target_distance_max_m, pace_min_sec_per_km, pace_max_sec_per_km,
        minimum_weekly_frequency, join_type, max_members, status)
     VALUES ($1, '종로 아침 러너스', '종로구를 중심으로 주 3회, 6km 안팎을 함께 달리는 크루입니다. 초보자도 부담 없이 오세요!',
             '종로구', '종로3가역 5번출구', 4000, 8000, 320, 360, 3, 'PUBLIC', 30, 'RECRUITING')
     RETURNING crew_id`,
    [ADMIN_UUID]
  );
  console.log('크루 A(조건 맞음) 생성:', crewA.rows[0].crew_id);

  // 크루 B: admin 조건과 전혀 안 맞는 크루(더 먼 거리, 훨씬 빠른 페이스, 다른 지역, 주 6회)
  const crewB = await client.query(
    `INSERT INTO crew.crews
       (owner_user_id, crew_name, description, region_code, meeting_location,
        target_distance_min_m, target_distance_max_m, pace_min_sec_per_km, pace_max_sec_per_km,
        minimum_weekly_frequency, join_type, max_members, status)
     VALUES ($1, '강남 서브3 스피드런', '풀마라톤 서브3를 목표로 매일 20km 이상, 4분대 페이스로 훈련하는 상급자 전용 크루입니다.',
             '강남구', '강남역 11번출구', 18000, 30000, 240, 270, 6, 'PRIVATE', 15, 'RECRUITING')
     RETURNING crew_id`,
    [ADMIN_UUID]
  );
  console.log('크루 B(조건 안 맞음) 생성:', crewB.rows[0].crew_id);

  // 두 크루 모두 admin을 LEADER 멤버로도 등록(크루 소유자는 자기 크루의 멤버이기도 한 게 자연스러움).
  for (const { rows } of [crewA, crewB]) {
    await client.query(
      `INSERT INTO crew.crew_members (crew_id, user_id, role, status)
       VALUES ($1, $2, 'LEADER', 'ACTIVE') ON CONFLICT (crew_id, user_id) DO NOTHING`,
      [rows[0].crew_id, ADMIN_UUID]
    );
  }

  await client.query('COMMIT');
  console.log('완료');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('실패, 롤백함:', err);
  process.exit(1);
} finally {
  await client.end();
}
