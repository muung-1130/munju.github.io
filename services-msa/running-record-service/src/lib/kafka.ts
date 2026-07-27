import { randomUUID } from 'crypto';
import { Kafka, Partitioners } from 'kafkajs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.201:29092').split(',');
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

export async function publishRunCompletedEvent(payload: RunCompletedEventPayload) {
  const event: RunCompletedEvent = {
    eventId: randomUUID(),
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
