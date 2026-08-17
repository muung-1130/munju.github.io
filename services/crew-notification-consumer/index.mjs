// crew 이벤트를 받아 notification.notifications에 알림을 적재한다.
import './otel.mjs';
import { Kafka } from 'kafkajs';
import { Pool } from 'pg';
import { startSqsConsumer } from './sqs.mjs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.212:29092').split(',');
const TOPIC = 'crew.join-request-events';
const EVENT_TYPES = ['JoinRequestSubmitted', 'JoinRequestApproved', 'BattleDeclined', 'BattleStarted'];
const messagingProvider = (process.env.MESSAGING_PROVIDER ?? 'kafka').trim().toLowerCase();

async function insertNotification(client, { userId, notificationType, title, body, referenceType, referenceId, eventId }) {
  await client.query(
    `INSERT INTO notification.notifications
       (user_id, notification_type, title, body, target_url, reference_type, reference_id, source_event_id)
     VALUES ($1, $2, $3, $4, '/crew', $5, $6, $7)
     ON CONFLICT (source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING`,
    [userId, notificationType, title, body, referenceType, referenceId, eventId]
  );
}

async function processEvent(client, event) {
  if (event.eventType === 'JoinRequestSubmitted') {
    const { joinRequestId, crewId, crewName, applicantNickname, ownerUserId, message } = event.payload;
    await insertNotification(client, {
      userId: ownerUserId, notificationType: 'CREW_JOIN_REQUESTED', title: `${crewName} 가입 신청이 왔어요`,
      body: message ? `${applicantNickname}님이 가입을 신청했어요. "${message}"` : `${applicantNickname}님이 가입을 신청했어요.`,
      referenceType: 'CREW_JOIN_REQUEST', referenceId: joinRequestId, eventId: event.eventId
    });
    console.log(`[crew-notification-consumer] JoinRequestSubmitted crew=${crewId}`);
  } else if (event.eventType === 'JoinRequestApproved') {
    const { crewId, crewName, applicantUserId } = event.payload;
    await insertNotification(client, {
      userId: applicantUserId, notificationType: 'CREW_JOIN_APPROVED', title: `${crewName} 가입이 승인됐어요!`,
      body: '채팅방에 들어가시겠어요?', referenceType: 'CREW', referenceId: crewId, eventId: event.eventId
    });
    console.log(`[crew-notification-consumer] JoinRequestApproved crew=${crewId}`);
  } else if (event.eventType === 'BattleDeclined') {
    const { battleId, leaderUserId, opponentCrewName, metricLabel } = event.payload;
    await insertNotification(client, {
      userId: leaderUserId, notificationType: 'CREW_BATTLE_DECLINED', title: `${opponentCrewName} 크루가 배틀을 거절했어요`,
      body: `신청하신 ${metricLabel} 배틀에 24시간 안에 응답이 없었거나 거절됐어요.`,
      referenceType: 'CREW_BATTLE', referenceId: battleId, eventId: event.eventId
    });
    console.log(`[crew-notification-consumer] BattleDeclined battle=${battleId}`);
  } else if (event.eventType === 'BattleStarted') {
    const { battleId, userId, opponentCrewName, metricLabel } = event.payload;
    await insertNotification(client, {
      userId, notificationType: 'CREW_BATTLE_STARTED', title: `${opponentCrewName} 크루와의 배틀이 시작되었어요`,
      body: `${metricLabel} 배틀이 시작됐어요. 1주일간 힘내봐요!`,
      referenceType: 'CREW_BATTLE', referenceId: battleId, eventId: event.eventId
    });
    console.log(`[crew-notification-consumer] BattleStarted battle=${battleId} user=${userId}`);
  } else {
    throw new Error(`지원하지 않는 eventType: ${String(event.eventType)}`);
  }
}

async function main() {
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
  pg.on('error', (err) => console.error('[crew-notification-consumer] idle client error', err));
  await pg.query('SELECT 1');
  console.log('[crew-notification-consumer] postgres pool ready');

  if (messagingProvider === 'sns-sqs' || messagingProvider === 'sqs') {
    return startSqsConsumer({
      queueUrl: process.env.CREW_NOTIFICATION_QUEUE_URL,
      allowedEventTypes: EVENT_TYPES,
      serviceName: 'crew-notification-consumer',
      onMessage: (event) => processEvent(pg, event)
    });
  }
  if (messagingProvider !== 'kafka') throw new Error(`지원하지 않는 MESSAGING_PROVIDER: ${messagingProvider}`);

  const kafka = new Kafka({ clientId: 'crew-notification-consumer', brokers: KAFKA_BROKERS, logLevel: 1 });
  const consumer = kafka.consumer({ groupId: 'crew-notification-consumer' });
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({ topics: [{ topic: TOPIC, numPartitions: 1, replicationFactor: 1 }], waitForLeaders: true });
  } finally {
    await admin.disconnect();
  }
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`[crew-notification-consumer] subscribed to ${TOPIC}`);
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        await processEvent(pg, JSON.parse(message.value.toString()));
      } catch (err) {
        console.error('[crew-notification-consumer] 처리 실패:', err.message);
      }
    }
  });
}

console.log(`[crew-notification-consumer] starting (provider=${messagingProvider})`);
main().catch((err) => {
  console.error('[crew-notification-consumer] fatal error:', err);
  process.exit(1);
});
