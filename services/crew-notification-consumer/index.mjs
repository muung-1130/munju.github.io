// crew.join-request-events 토픽을 구독해 notification.notifications에 알림을 적재하는 소비자.
// Next.js API(join-request 신청, join-requests/[id]/decision 승인)가 크루 도메인 데이터(crew_join_requests,
// crew_members)는 요청 안에서 이미 동기로 반영하고, "누구에게 어떤 알림을 띄울지"만 이벤트로 흘려보낸다 —
// 이 프로세스가 그걸 받아 알림 서비스 소유 테이블(notification.notifications)에만 반영한다.
import './otel.mjs';
import { Kafka } from 'kafkajs';
import { Pool } from 'pg';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.212:29092').split(',');
const TOPIC = 'crew.join-request-events';

const kafka = new Kafka({ clientId: 'crew-notification-consumer', brokers: KAFKA_BROKERS, logLevel: 1 });
const consumer = kafka.consumer({ groupId: 'crew-notification-consumer' });

// at-least-once 전달을 가정하므로 source_event_id UNIQUE 제약(부분 인덱스)에 기대어
// 같은 이벤트가 재전달돼도 알림이 중복 생성되지 않게 한다.
async function insertNotification(client, { userId, notificationType, title, body, referenceType, referenceId, eventId }) {
  await client.query(
    `INSERT INTO notification.notifications
       (user_id, notification_type, title, body, target_url, reference_type, reference_id, source_event_id)
     VALUES ($1, $2, $3, $4, '/crew', $5, $6, $7)
     ON CONFLICT (source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING`,
    [userId, notificationType, title, body, referenceType, referenceId, eventId]
  );
}

async function handleJoinRequestSubmitted(client, event) {
  const { joinRequestId, crewName, applicantNickname, ownerUserId, message } = event.payload;
  await insertNotification(client, {
    userId: ownerUserId,
    notificationType: 'CREW_JOIN_REQUESTED',
    title: `${crewName} 가입 신청이 왔어요`,
    body: message ? `${applicantNickname}님이 가입을 신청했어요. "${message}"` : `${applicantNickname}님이 가입을 신청했어요.`,
    referenceType: 'CREW_JOIN_REQUEST',
    referenceId: joinRequestId,
    eventId: event.eventId
  });
}

async function handleJoinRequestApproved(client, event) {
  const { crewId, crewName, applicantUserId } = event.payload;
  await insertNotification(client, {
    userId: applicantUserId,
    notificationType: 'CREW_JOIN_APPROVED',
    title: `${crewName} 가입이 승인됐어요!`,
    body: '채팅방에 들어가시겠어요?',
    referenceType: 'CREW',
    referenceId: crewId,
    eventId: event.eventId
  });
}

async function handleBattleDeclined(client, event) {
  const { battleId, leaderUserId, opponentCrewName, metricLabel } = event.payload;
  await insertNotification(client, {
    userId: leaderUserId,
    notificationType: 'CREW_BATTLE_DECLINED',
    title: `${opponentCrewName} 크루가 배틀을 거절했어요`,
    body: `신청하신 ${metricLabel} 배틀에 24시간 안에 응답이 없었거나 거절됐어요.`,
    referenceType: 'CREW_BATTLE',
    referenceId: battleId,
    eventId: event.eventId
  });
}

async function handleBattleStarted(client, event) {
  const { battleId, userId, opponentCrewName, metricLabel } = event.payload;
  await insertNotification(client, {
    userId,
    notificationType: 'CREW_BATTLE_STARTED',
    title: `${opponentCrewName} 크루와의 배틀이 시작되었어요`,
    body: `${metricLabel} 배틀이 시작됐어요. 1주일간 힘내봐요!`,
    referenceType: 'CREW_BATTLE',
    referenceId: battleId,
    eventId: event.eventId
  });
}

async function main() {
  // 단일 Client를 프로세스 수명 내내 붙들고 있으면, 그 커넥션이 네트워크 계층에서 리셋될 때
  // (ECONNRESET) unhandled 'error' event로 프로세스 전체가 죽는다 — 실제로 이 크래시가
  // 반복 관측됐다. Pool로 바꾸면 죽은 커넥션은 자동으로 새로 만들어 쓰므로 자체 복구된다.
  const pg = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    keepAlive: true
  });
  pg.on('error', (err) => {
    console.error('[crew-notification-consumer] idle client error', err);
  });
  console.log('[crew-notification-consumer] postgres pool ready');

  // course.like-events와 달리 이 토픽은 producer가 아직 한 번도 메시지를 보낸 적이 없어
  // 브로커에 자동 생성돼있지 않을 수 있다. subscribe가 UNKNOWN_TOPIC_OR_PARTITION으로 죽지
  // 않도록 먼저 admin API로 토픽을 만들어둔다(이미 있으면 조용히 무시).
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({ topics: [{ topic: TOPIC, numPartitions: 1, replicationFactor: 1 }], waitForLeaders: true });
    console.log(`[crew-notification-consumer] topic ${TOPIC} ready`);
  } catch (err) {
    console.log(`[crew-notification-consumer] createTopics 건너뜀(이미 존재하거나 권한 없음): ${err.message}`);
  } finally {
    await admin.disconnect();
  }

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`[crew-notification-consumer] subscribed to ${TOPIC}`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      let event;
      try {
        event = JSON.parse(message.value.toString());
      } catch (err) {
        console.error('[crew-notification-consumer] 잘못된 메시지, 건너뜀:', err.message);
        return;
      }

      try {
        if (event.eventType === 'JoinRequestSubmitted') {
          await handleJoinRequestSubmitted(pg, event);
          console.log(`[crew-notification-consumer] JoinRequestSubmitted crew=${event.payload.crewId}`);
        } else if (event.eventType === 'JoinRequestApproved') {
          await handleJoinRequestApproved(pg, event);
          console.log(`[crew-notification-consumer] JoinRequestApproved crew=${event.payload.crewId}`);
        } else if (event.eventType === 'BattleDeclined') {
          await handleBattleDeclined(pg, event);
          console.log(`[crew-notification-consumer] BattleDeclined battle=${event.payload.battleId}`);
        } else if (event.eventType === 'BattleStarted') {
          await handleBattleStarted(pg, event);
          console.log(`[crew-notification-consumer] BattleStarted battle=${event.payload.battleId} user=${event.payload.userId}`);
        }
      } catch (err) {
        console.error('[crew-notification-consumer] 알림 적재 실패:', err.message);
      }
    }
  });
}

main().catch((err) => {
  console.error('[crew-notification-consumer] fatal error:', err);
  process.exit(1);
});
