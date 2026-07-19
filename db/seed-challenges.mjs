// 챌린지 페이지 데모용 시드 스크립트. 개인/공개 챌린지와 참가 기록을 만든다.
// 참가자 다양성을 위해 이름만 가진 데모 계정 몇 개를 auth_user.users에 추가한다(로그인 불가,
// user_password는 NULL — 이미 구글전용 계정이 NULL 비밀번호를 갖는 것과 같은 패턴).
import { Client } from 'pg';

const client = new Client();
await client.connect();

const { rows: adminRows } = await client.query(`SELECT user_id FROM auth_user.users WHERE user_name = 'admin'`);
const adminId = adminRows[0].user_id;

const demoUsers = [
  ['러너제이', '서울특별시 마포구 합정동'],
  ['한강모임장', '서울특별시 영등포구 여의동'],
  ['달림이', '서울특별시 강남구 역삼1동'],
  ['페이스마스터', '서울특별시 종로구 청운효자동'],
  ['아침러너', '서울특별시 성동구 성수1가1동'],
  ['새벽러너', '서울특별시 송파구 잠실6동']
];

const demoIds = {};
for (const [nickname, dong] of demoUsers) {
  const email = `${nickname}_demo@dairun.site`;
  const { rows } = await client.query(
    `INSERT INTO auth_user.users (user_name, user_email, nickname, dong, gender, birth_year, status)
     VALUES ($1, $2, $1, $3, 'FEMALE', 1994, 'ACTIVE')
     ON CONFLICT ((lower(user_email::text))) WHERE deleted_at IS NULL DO UPDATE SET nickname = EXCLUDED.nickname
     RETURNING user_id`,
    [nickname, email, dong]
  );
  demoIds[nickname] = rows[0].user_id;
}
console.log('demo users ready:', demoIds);

async function insertChallenge(input) {
  const { rows } = await client.query(
    `INSERT INTO challenge.challenges
       (creator_user_id, challenge_type, name, description, metric_type, target_value, start_at, end_at, visibility, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING challenge_id`,
    [
      input.creatorUserId,
      input.challengeType,
      input.name,
      input.description,
      input.metricType,
      input.targetValue,
      input.startAt,
      input.endAt,
      input.visibility,
      input.status
    ]
  );
  return rows[0].challenge_id;
}

async function insertParticipation(challengeId, userId, p) {
  await client.query(
    `INSERT INTO challenge.challenge_participations
       (challenge_id, user_id, status, progress_value, progress_ratio, streak_count, joined_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [challengeId, userId, p.status, p.progressValue, p.progressRatio, p.streakCount ?? 0, p.joinedAt, p.completedAt ?? null]
  );
}

// ---- 개인 챌린지 (전부 admin 소유) ----
const may100k = await insertChallenge({
  creatorUserId: adminId,
  challengeType: 'PERSONAL',
  name: '5월 100K 챌린지',
  description: '5월 한 달 동안 누적 100km 달리기.',
  metricType: 'DISTANCE',
  targetValue: 100,
  startAt: '2026-05-01T00:00:00+09:00',
  endAt: '2026-05-31T23:59:59+09:00',
  visibility: 'PRIVATE',
  status: 'COMPLETED'
});
await insertParticipation(may100k, adminId, {
  status: 'COMPLETED', progressValue: 100, progressRatio: 100,
  joinedAt: '2026-05-01T09:00:00+09:00', completedAt: '2026-05-29T18:20:00+09:00'
});

const weekday5 = await insertChallenge({
  creatorUserId: adminId,
  challengeType: 'PERSONAL',
  name: '주 5일 연속 달리기 챌린지',
  description: '이번 주 5일 연속으로 달려보세요.',
  metricType: 'STREAK',
  targetValue: 5,
  startAt: '2026-07-13T00:00:00+09:00',
  endAt: '2026-07-19T23:59:59+09:00',
  visibility: 'PRIVATE',
  status: 'ACTIVE'
});
await insertParticipation(weekday5, adminId, {
  status: 'ACTIVE', progressValue: 3, progressRatio: 60, streakCount: 3, joinedAt: '2026-07-13T07:00:00+09:00'
});

const july30k = await insertChallenge({
  creatorUserId: adminId,
  challengeType: 'PERSONAL',
  name: '7월 30K 챌린지',
  description: '7월 한 달 동안 누적 30km 달리기.',
  metricType: 'DISTANCE',
  targetValue: 30,
  startAt: '2026-07-01T00:00:00+09:00',
  endAt: '2026-07-31T23:59:59+09:00',
  visibility: 'PRIVATE',
  status: 'ACTIVE'
});
await insertParticipation(july30k, adminId, {
  status: 'ACTIVE', progressValue: 18.4, progressRatio: 61.3, joinedAt: '2026-07-01T08:00:00+09:00'
});

const morningHabit = await insertChallenge({
  creatorUserId: adminId,
  challengeType: 'PERSONAL',
  name: '아침 러닝 습관 만들기',
  description: '한 달 동안 아침 러닝 20회 채우기.',
  metricType: 'COUNT',
  targetValue: 20,
  startAt: '2026-07-01T00:00:00+09:00',
  endAt: '2026-07-31T23:59:59+09:00',
  visibility: 'PRIVATE',
  status: 'ACTIVE'
});
await insertParticipation(morningHabit, adminId, {
  status: 'ACTIVE', progressValue: 9, progressRatio: 45, joinedAt: '2026-07-01T06:30:00+09:00'
});

// ---- 공개 챌린지 ----
const c5k = await insertChallenge({
  creatorUserId: adminId,
  challengeType: 'PUBLIC',
  name: '30일 5K 완주 챌린지',
  description: '30일 동안 매일 5km씩, 누적 150km를 달려보세요.',
  metricType: 'DISTANCE',
  targetValue: 150,
  startAt: '2026-07-01T00:00:00+09:00',
  endAt: '2026-07-31T23:59:59+09:00',
  visibility: 'PUBLIC',
  status: 'ACTIVE'
});
await insertParticipation(c5k, adminId, { status: 'ACTIVE', progressValue: 92, progressRatio: 61.3, joinedAt: '2026-07-01T09:00:00+09:00' });
await insertParticipation(c5k, demoIds['러너제이'], { status: 'COMPLETED', progressValue: 150, progressRatio: 100, joinedAt: '2026-07-02T09:00:00+09:00', completedAt: '2026-07-10T20:00:00+09:00' });
await insertParticipation(c5k, demoIds['한강모임장'], { status: 'ACTIVE', progressValue: 40, progressRatio: 26.7, joinedAt: '2026-07-16T07:30:00+09:00' });
await insertParticipation(c5k, demoIds['달림이'], { status: 'ACTIVE', progressValue: 10, progressRatio: 6.7, joinedAt: '2026-07-17T07:00:00+09:00' });
await insertParticipation(c5k, demoIds['페이스마스터'], { status: 'COMPLETED', progressValue: 150, progressRatio: 100, joinedAt: '2026-07-05T09:00:00+09:00', completedAt: '2026-07-15T19:00:00+09:00' });

const hanRiver200 = await insertChallenge({
  creatorUserId: adminId,
  challengeType: 'PUBLIC',
  name: '한강 종주 200km',
  description: '한강의 모든 구간을 누적 거리로 정복해요.',
  metricType: 'DISTANCE',
  targetValue: 200,
  startAt: '2026-07-01T00:00:00+09:00',
  endAt: '2026-08-15T23:59:59+09:00',
  visibility: 'PUBLIC',
  status: 'ACTIVE'
});
await insertParticipation(hanRiver200, adminId, { status: 'ACTIVE', progressValue: 120, progressRatio: 60, joinedAt: '2026-07-03T09:00:00+09:00' });
await insertParticipation(hanRiver200, demoIds['아침러너'], { status: 'ACTIVE', progressValue: 40, progressRatio: 20, joinedAt: '2026-07-15T06:30:00+09:00' });
await insertParticipation(hanRiver200, demoIds['새벽러너'], { status: 'ACTIVE', progressValue: 5, progressRatio: 2.5, joinedAt: '2026-07-17T05:30:00+09:00' });
await insertParticipation(hanRiver200, demoIds['달림이'], { status: 'ACTIVE', progressValue: 88, progressRatio: 44, joinedAt: '2026-07-14T18:00:00+09:00' });

const paceMaster = await insertChallenge({
  creatorUserId: adminId,
  challengeType: 'PUBLIC',
  name: "페이스 마스터 5'00\"",
  description: '평균 페이스를 5분대 이내로 꾸준히 유지해보세요.',
  metricType: 'PACE',
  targetValue: 300,
  startAt: '2026-07-01T00:00:00+09:00',
  endAt: '2026-07-31T23:59:59+09:00',
  visibility: 'PUBLIC',
  status: 'ACTIVE'
});
await insertParticipation(paceMaster, adminId, { status: 'ACTIVE', progressValue: 312, progressRatio: 88, joinedAt: '2026-07-01T09:00:00+09:00' });
await insertParticipation(paceMaster, demoIds['페이스마스터'], { status: 'COMPLETED', progressValue: 298, progressRatio: 100, joinedAt: '2026-07-02T09:00:00+09:00', completedAt: '2026-07-12T19:00:00+09:00' });
await insertParticipation(paceMaster, demoIds['러너제이'], { status: 'ACTIVE', progressValue: 330, progressRatio: 65, joinedAt: '2026-07-16T09:00:00+09:00' });

const morningCert = await insertChallenge({
  creatorUserId: demoIds['러너제이'],
  challengeType: 'PUBLIC',
  name: '아침러닝 인증 챌린지',
  description: '매일 아침 6시, 인증샷과 함께 하루를 시작해요.',
  metricType: 'COUNT',
  targetValue: 20,
  startAt: '2026-07-01T00:00:00+09:00',
  endAt: '2026-07-31T23:59:59+09:00',
  visibility: 'PUBLIC',
  status: 'ACTIVE'
});
await insertParticipation(morningCert, demoIds['러너제이'], { status: 'COMPLETED', progressValue: 20, progressRatio: 100, joinedAt: '2026-07-01T06:00:00+09:00', completedAt: '2026-07-14T06:30:00+09:00' });
await insertParticipation(morningCert, adminId, { status: 'ACTIVE', progressValue: 6, progressRatio: 30, joinedAt: '2026-07-10T06:00:00+09:00' });
await insertParticipation(morningCert, demoIds['아침러너'], { status: 'ACTIVE', progressValue: 1, progressRatio: 5, joinedAt: '2026-07-17T06:00:00+09:00' });

const weekend20 = await insertChallenge({
  creatorUserId: demoIds['한강모임장'],
  challengeType: 'PUBLIC',
  name: '주말 20km 완주',
  description: '매주 주말 함께 20km 완주를 목표로 달려요.',
  metricType: 'DISTANCE',
  targetValue: 20,
  startAt: '2026-07-04T00:00:00+09:00',
  endAt: '2026-08-30T23:59:59+09:00',
  visibility: 'PUBLIC',
  status: 'ACTIVE'
});
await insertParticipation(weekend20, demoIds['한강모임장'], { status: 'ACTIVE', progressValue: 12, progressRatio: 60, joinedAt: '2026-07-04T09:00:00+09:00' });
await insertParticipation(weekend20, demoIds['달림이'], { status: 'ACTIVE', progressValue: 8, progressRatio: 40, joinedAt: '2026-07-12T09:00:00+09:00' });
await insertParticipation(weekend20, demoIds['새벽러너'], { status: 'ACTIVE', progressValue: 0, progressRatio: 0, joinedAt: '2026-07-17T09:00:00+09:00' });

console.log('challenges seeded:', { may100k, weekday5, july30k, morningHabit, c5k, hanRiver200, paceMaster, morningCert, weekend20 });

await client.end();
