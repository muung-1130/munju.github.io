// 크루 배틀을 직접 크루 개설부터 배틀 시작까지 사용자가 손으로 눌러보기 위한 전용 테스트 계정.
// test1은 admin의 크루(종로 아침 러너스, 오늘 평균 5.0~5.1km)와 누적 km이 비슷하게,
// test2는 admin의 크루(오늘 평균 페이스 5.4분/km)와 페이스가 비슷하게 오늘 기록을 맞춰뒀다.
// 각자 혼자만 있는 크루를 하나씩 만들어 크루장으로서 배틀을 제안/승인해볼 수 있게 했다.
import bcrypt from 'bcryptjs';
import { Client } from 'pg';

const client = new Client();
await client.connect();

async function createTestUser(username, password, nickname, dong) {
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await client.query(
    `INSERT INTO auth_user.users (user_password, user_name, user_email, nickname, dong, gender, birth_year, status)
     VALUES ($1, $2, $3, $4, $5, 'MALE', 1995, 'ACTIVE')
     ON CONFLICT ((lower(user_email::text))) WHERE deleted_at IS NULL DO UPDATE SET user_password = EXCLUDED.user_password
     RETURNING user_id`,
    [hash, username, `${username}@dairun.site`, nickname, dong]
  );
  return rows[0].user_id;
}

async function createSoloCrew(ownerId, crewName, regionCode) {
  const { rows } = await client.query(
    `INSERT INTO crew.crews (owner_user_id, crew_name, description, region_code, meeting_location, join_type, max_members, status)
     VALUES ($1, $2, $3, $4, '자유 집합', 'PUBLIC', 10, 'RECRUITING')
     RETURNING crew_id`,
    [ownerId, crewName, `${crewName} 크루 배틀 테스트용 크루입니다.`, regionCode]
  );
  const crewId = rows[0].crew_id;
  await client.query(`INSERT INTO crew.crew_members (crew_id, user_id, role, status) VALUES ($1, $2, 'LEADER', 'ACTIVE')`, [
    crewId,
    ownerId
  ]);
  return crewId;
}

async function addRunToday(userId, distanceM, paceSecPerKm) {
  const durationSec = Math.round((distanceM / 1000) * paceSecPerKm);
  const startedAt = new Date();
  startedAt.setHours(7, 30, 0, 0);
  const completedAt = new Date(startedAt.getTime() + durationSec * 1000);
  await client.query(
    `INSERT INTO running_record.runs
       (user_id, source_type, status, started_at, completed_at, duration_sec, moving_duration_sec, distance_m, average_pace_sec_per_km)
     VALUES ($1, 'MANUAL', 'COMPLETED', $2, $3, $4, $4, $5, $6)`,
    [userId, startedAt.toISOString(), completedAt.toISOString(), durationSec, distanceM, paceSecPerKm]
  );
}

// test1: admin 크루(종로 아침 러너스, 오늘 평균 약 5.0~5.1km)와 누적 km이 비슷하도록 5100m.
const test1Id = await createTestUser('test1', 'test1!', '테스트유저1', '서울특별시 종로구 청운효자동');
const test1CrewId = await createSoloCrew(test1Id, '테스트원 러닝크루', '종로구');
await addRunToday(test1Id, 5100, 350);

// test2: admin 크루의 오늘 평균 페이스(약 5.4분/km, 325초/km)와 비슷하도록 325초/km으로 맞춤.
const test2Id = await createTestUser('test2', 'test2!', '테스트유저2', '서울특별시 강남구 역삼1동');
const test2CrewId = await createSoloCrew(test2Id, '테스트투 러닝크루', '강남구');
await addRunToday(test2Id, 6000, 325);

console.log('test1:', { userId: test1Id, crewId: test1CrewId });
console.log('test2:', { userId: test2Id, crewId: test2CrewId });

await client.end();
