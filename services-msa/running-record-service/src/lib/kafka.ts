import { randomUUID } from 'crypto';
import { Kafka, Partitioners } from 'kafkajs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.212:29092').split(',');
export const RUN_COMPLETED_EVENTS_TOPIC = 'running.run-completed-events';

let producer: ReturnType<Kafka['producer']> | undefined;

function getProducer() {
  if (!producer) {
    const kafka = new Kafka({ clientId: 'running-record-service', brokers: KAFKA_BROKERS, logLevel: 1 });
    producer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });
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

type RunCompletedEvent = {
  eventId: string;
  eventType: 'RunCompleted';
  occurredAt: string;
  producer: string;
  aggregateId: string;
  schemaVersion: number;
  traceId: string;
  payload: RunCompletedEventPayload;
};

// eventId는 항상 호출자(outboxPublisher)가 running_record.outbox_events.event_id를 그대로
// 넘겨준다 — 이 값이 곧 다운스트림 컨슈머들의 멱등키(source_event_id)가 되므로, 여기서 새로
// 발급하면 outbox에 적재된 eventId와 실제 발행되는 eventId가 어긋난다.
export async function publishRunCompletedEvent(eventId: string, payload: RunCompletedEventPayload) {
  const event: RunCompletedEvent = {
    eventId,
    eventType: 'RunCompleted',
    occurredAt: new Date().toISOString(),
    producer: 'running-record-service',
    aggregateId: payload.runId,
    schemaVersion: 1,
    traceId: randomUUID(),
    payload
  };

  const p = getProducer();
  await p.connect();
  await p.send({
    topic: RUN_COMPLETED_EVENTS_TOPIC,
    messages: [{ key: payload.runId, value: JSON.stringify(event) }]
  });
}
