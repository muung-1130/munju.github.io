// 크루 배틀 기능 데모용 시드: 챌린지 기능 때 만든 데모 유저 6명을 admin의 기존 3개 크루에
// 멤버로 넣고, 오늘 날짜로 러닝 기록을 남겨 "오늘 크루원 평균 km/페이스" 매칭이 실제로 동작하는
// 걸 확인할 수 있게 한다.
//   하이미디어 달리자(admin+러너제이+한강모임장) 평균 5.1km -> floor 5
//   종로 아침 러너스(달림이+페이스마스터)         평균 5.1km -> floor 5  (동일 tier 매칭 확인용)
//   강남 서브3 스피드런(아침러너+새벽러너)         평균 7.2km -> floor 7  (widen 로직 확인용)
import { Client } from 'pg';

const client = new Client();
await client.connect();

async function getUserId(nickname) {
  const { rows } = await client.query(`SELECT user_id FROM auth_user.users WHERE nickname = $1 LIMIT 1`, [nickname]);
  if (rows.length === 0) throw new Error(`데모 유저를 찾을 수 없어요: ${nickname}`);
  return rows[0].user_id;
}

async function getCrewId(crewName) {
  const { rows } = await client.query(`SELECT crew_id FROM crew.crews WHERE crew_name = $1 LIMIT 1`, [crewName]);
  if (rows.length === 0) throw new Error(`크루를 찾을 수 없어요: ${crewName}`);
  return rows[0].crew_id;
}

async function addMember(crewId, userId) {
  await client.query(
    `INSERT INTO crew.crew_members (crew_id, user_id, role, status) VALUES ($1, $2, 'MEMBER', 'ACTIVE')
     ON CONFLICT (crew_id, user_id) DO UPDATE SET status = 'ACTIVE', left_at = NULL`,
    [crewId, userId]
  );
}

async function addRunToday(userId, distanceM, paceSecPerKm) {
  const durationSec = Math.round((distanceM / 1000) * paceSecPerKm);
  const startedAt = new Date();
  startedAt.setHours(7, 0, 0, 0);
  const completedAt = new Date(startedAt.getTime() + durationSec * 1000);
  await client.query(
    `INSERT INTO running_record.runs
       (user_id, source_type, status, started_at, completed_at, duration_sec, moving_duration_sec, distance_m, average_pace_sec_per_km)
     VALUES ($1, 'MANUAL', 'COMPLETED', $2, $3, $4, $4, $5, $6)`,
    [userId, startedAt.toISOString(), completedAt.toISOString(), durationSec, distanceM, paceSecPerKm]
  );
}

const adminId = await getUserId('관리자');
const users = {
  러너제이: await getUserId('러너제이'),
  한강모임장: await getUserId('한강모임장'),
  달림이: await getUserId('달림이'),
  페이스마스터: await getUserId('페이스마스터'),
  아침러너: await getUserId('아침러너'),
  새벽러너: await getUserId('새벽러너')
};

const crews = {
  하이미디어달리자: await getCrewId('하이미디어 달리자'),
  종로아침러너스: await getCrewId('종로 아침 러너스'),
  강남서브3스피드런: await getCrewId('강남 서브3 스피드런')
};

await addMember(crews.하이미디어달리자, users.러너제이);
await addMember(crews.하이미디어달리자, users.한강모임장);
await addMember(crews.종로아침러너스, users.달림이);
await addMember(crews.종로아침러너스, users.페이스마스터);
await addMember(crews.강남서브3스피드런, users.아침러너);
await addMember(crews.강남서브3스피드런, users.새벽러너);

await addRunToday(adminId, 5000, 340);
await addRunToday(users.러너제이, 5000, 335);
await addRunToday(users.한강모임장, 5300, 350);
await addRunToday(users.달림이, 5200, 338);
await addRunToday(users.페이스마스터, 5000, 300);
await addRunToday(users.아침러너, 7000, 320);
await addRunToday(users.새벽러너, 7400, 315);

console.log('crew battle demo data seeded');
await client.end();
