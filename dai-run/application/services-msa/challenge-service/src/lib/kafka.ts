import { randomUUID } from 'crypto';
import { Kafka, Partitioners } from 'kafkajs';
import type { RunCompletedEventPayload } from './runCompletedEvent.js';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.212:29092').split(',');
export const RUN_COMPLETED_EVENTS_TOPIC = 'running.run-completed-events';
export const CHALLENGE_COMPLETED_EVENTS_TOPIC = 'challenge.challenge-completed-events';

function getKafka() {
  return new Kafka({ clientId: 'challenge-service', brokers: KAFKA_BROKERS, logLevel: 1 });
}

let producer: ReturnType<Kafka['producer']> | undefined;
function getProducer() {
  if (!producer) {
    producer = getKafka().producer({ createPartitioner: Partitioners.LegacyPartitioner });
  }
  return producer;
}

export type ChallengeCompletedEventPayload = {
  userId: string;
  challengeId: string;
  challengeName: string;
};

type ChallengeCompletedEvent = {
  eventId: string;
  eventType: 'ChallengeCompleted';
  occurredAt: string;
  producer: string;
  aggregateId: string;
  schemaVersion: number;
  traceId: string;
  payload: ChallengeCompletedEventPayload;
};

// eventId는 호출자(outboxPublisher)가 challenge.outbox_events.event_id를 그대로 넘긴다 —
// running-record-service의 동일 패턴(kafka.ts) 참고.
export async function publishChallengeCompletedEvent(eventId: string, payload: ChallengeCompletedEventPayload) {
  const event: ChallengeCompletedEvent = {
    eventId,
    eventType: 'ChallengeCompleted',
    occurredAt: new Date().toISOString(),
    producer: 'challenge-service',
    aggregateId: payload.challengeId,
    schemaVersion: 1,
    traceId: randomUUID(),
    payload
  };

  const p = getProducer();
  await p.connect();
  await p.send({
    topic: CHALLENGE_COMPLETED_EVENTS_TOPIC,
    messages: [{ key: payload.challengeId, value: JSON.stringify(event) }]
  });
}

export type { RunCompletedEventPayload };

// running-record-service가 발행하는 RunCompleted를 구독해 챌린지 진행도에 반영한다.
// groupId는 레포 전체(services/*, services-msa/*)에서 유일해야 한다 — 다른 서비스와 겹치면
// 같은 컨슈머 그룹으로 취급돼 메시지가 분산(중복이 아니라 유실)된다.
export function createRunCompletedConsumer(onMessage: (eventId: string, payload: RunCompletedEventPayload) => Promise<void>) {
  const kafka = getKafka();
  const consumer = kafka.consumer({ groupId: 'challenge-service' });
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
            console.log(`RunCompleted 처리 완료 (eventId=${event.eventId})`);
          } catch (err) {
            console.error(`RunCompleted 처리 실패 (eventId=${event.eventId}):`, err);
          }
        }
      });
    }
  };
}
