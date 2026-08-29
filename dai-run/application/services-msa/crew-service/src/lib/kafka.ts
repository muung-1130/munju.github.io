import { randomUUID } from 'crypto';
import { Kafka, Partitioners } from 'kafkajs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.212:29092').split(',');
export const CREW_JOIN_REQUEST_EVENTS_TOPIC = 'crew.join-request-events';
// running-record-service가 발행하는 토픽 — 위 CREW_JOIN_REQUEST_EVENTS_TOPIC과 다른 토픽이니
// 새 RunCompleted 컨슈머를 실수로 join-request 토픽에 구독시키지 않도록 주의.
export const RUN_COMPLETED_EVENTS_TOPIC = 'running.run-completed-events';

function getKafka() {
  return new Kafka({ clientId: 'crew-service', brokers: KAFKA_BROKERS, logLevel: 1 });
}

let producer: ReturnType<Kafka['producer']> | undefined;

function getProducer() {
  if (!producer) {
    producer = getKafka().producer({ createPartitioner: Partitioners.LegacyPartitioner });
  }
  return producer;
}

export type RunCompletedEventPayload = {
  runId: string;
  userId: string;
  courseId: string | null;
  myShoeId: string | null;
  sourceType: string;
  startedAt: string;
  completedAt: string;
  createdAt: string;
  distanceM: number;
  durationSec: number | null;
  movingDurationSec: number | null;
  averagePaceSecPerKm: number | null;
  bestPaceSecPerKm: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  averageCadence?: number | null;
  caloriesKcal?: number | null;
  elevationGainM?: number | null;
};

// running-record-service가 발행하는 RunCompleted를 구독해 진행 중인 크루 배틀을 갱신한다.
// groupId는 레포 전체에서 유일해야 한다.
export function createRunCompletedConsumer(onMessage: (eventId: string, payload: RunCompletedEventPayload) => Promise<void>) {
  const kafka = getKafka();
  const consumer = kafka.consumer({ groupId: 'crew-service' });
  const admin = kafka.admin();

  return {
    async start() {
      await admin.connect();
      try {
        await admin.createTopics({ topics: [{ topic: RUN_COMPLETED_EVENTS_TOPIC, numPartitions: 1 }] });
      } catch (err) {
        console.error('createTopics(이미 존재하면 무시):', err);
      }
      await admin.disconnect();

      await consumer.connect();
      await consumer.subscribe({ topic: RUN_COMPLETED_EVENTS_TOPIC, fromBeginning: false });
      await consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          const event = JSON.parse(message.value.toString());
          if (event.eventType !== 'RunCompleted') return;
          try {
            await onMessage(event.eventId, event.payload);
            console.log(`RunCompleted 처리 완료(eventId=${event.eventId})`);
          } catch (err) {
            console.error(`RunCompleted 처리 실패 (eventId=${event.eventId}):`, err);
          }
        }
      });
    }
  };
}

type CrewJoinRequestEvent = {
  eventId: string;
  eventType: 'JoinRequestSubmitted' | 'JoinRequestApproved';
  occurredAt: string;
  producer: string;
  aggregateId: string;
  schemaVersion: number;
  traceId: string;
  payload: {
    joinRequestId: string;
    crewId: string;
    crewName: string;
    applicantUserId: string;
    applicantNickname: string;
    ownerUserId: string;
    message: string | null;
  };
};

// 크루 가입 신청/승인은 crew.crew_join_requests·crew.crew_members에 API 요청 안에서 바로 반영되고,
// "알림을 누구에게 띄울지"는 이 이벤트를 구독하는 별도 consumer(crew-notification-consumer)가
// notification.notifications에 비동기로 적재한다 — 알림 서비스가 크루 서비스 테이블을 직접
// 조회하지 않도록 이벤트로만 경계를 넘긴다.
export async function publishCrewJoinRequestEvent(
  payload: CrewJoinRequestEvent['payload'],
  eventType: CrewJoinRequestEvent['eventType']
) {
  const event: CrewJoinRequestEvent = {
    eventId: randomUUID(),
    eventType,
    occurredAt: new Date().toISOString(),
    producer: 'crew-service',
    aggregateId: payload.joinRequestId,
    schemaVersion: 1,
    traceId: randomUUID(),
    payload
  };

  const p = getProducer();
  await p.connect();
  await p.send({
    topic: CREW_JOIN_REQUEST_EVENTS_TOPIC,
    messages: [{ key: payload.joinRequestId, value: JSON.stringify(event) }]
  });
}

type BattleDeclinedEvent = {
  eventId: string;
  eventType: 'BattleDeclined';
  occurredAt: string;
  producer: string;
  aggregateId: string;
  schemaVersion: number;
  traceId: string;
  payload: {
    battleId: string;
    leaderUserId: string;
    opponentCrewName: string;
    metricLabel: string;
  };
};

// 상대 크루가 배틀 제안을 거절했거나(명시적 거절 또는 24시간 무응답) 자동 거절 처리됐을 때,
// 제안한 크루의 크루장에게 알림을 보낸다. 가입 신청 알림과 같은 토픽·같은 consumer를 재사용한다.
export async function publishBattleDeclinedEvent(payload: BattleDeclinedEvent['payload']) {
  const event: BattleDeclinedEvent = {
    eventId: randomUUID(),
    eventType: 'BattleDeclined',
    occurredAt: new Date().toISOString(),
    producer: 'crew-service',
    aggregateId: payload.battleId,
    schemaVersion: 1,
    traceId: randomUUID(),
    payload
  };

  const p = getProducer();
  await p.connect();
  await p.send({
    topic: CREW_JOIN_REQUEST_EVENTS_TOPIC,
    messages: [{ key: payload.battleId, value: JSON.stringify(event) }]
  });
}

type BattleStartedEvent = {
  eventId: string;
  eventType: 'BattleStarted';
  occurredAt: string;
  producer: string;
  aggregateId: string;
  schemaVersion: number;
  traceId: string;
  payload: {
    battleId: string;
    userId: string;
    opponentCrewName: string;
    metricLabel: string;
  };
};

// 배틀 제안을 방장이 승인했거나 크루원 과반수 찬성으로 받아들여 배틀이 ACTIVE로 시작됐을 때,
// 양쪽 크루의 활성 멤버 각자에게 알림을 보낸다. JoinRequestSubmitted/BattleDeclined와 동일하게
// "이벤트 1건 = 알림 대상 1명" 단위를 유지한다(크루원 수만큼 이 함수가 반복 호출된다).
export async function publishBattleStartedEvent(payload: BattleStartedEvent['payload']) {
  const event: BattleStartedEvent = {
    eventId: randomUUID(),
    eventType: 'BattleStarted',
    occurredAt: new Date().toISOString(),
    producer: 'crew-service',
    aggregateId: payload.battleId,
    schemaVersion: 1,
    traceId: randomUUID(),
    payload
  };

  const p = getProducer();
  await p.connect();
  await p.send({
    topic: CREW_JOIN_REQUEST_EVENTS_TOPIC,
    messages: [{ key: `${payload.battleId}:${payload.userId}`, value: JSON.stringify(event) }]
  });
}
