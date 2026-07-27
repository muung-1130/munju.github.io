import { randomUUID } from 'crypto';
import { Kafka, Partitioners } from 'kafkajs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.201:29092').split(',');
export const CREW_JOIN_REQUEST_EVENTS_TOPIC = 'crew.join-request-events';

let producer: ReturnType<Kafka['producer']> | undefined;

function getProducer() {
  if (!producer) {
    const kafka = new Kafka({ clientId: 'crew-service', brokers: KAFKA_BROKERS, logLevel: 1 });
    producer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });
  }
  return producer;
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
