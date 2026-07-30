import { Kafka } from 'kafkajs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.212:29092').split(',');
export const RUN_COMPLETED_EVENTS_TOPIC = 'running.run-completed-events';

// Running Record 서비스가 소유한 이벤트 payload 타입.
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

// running-record-service가 발행하는 RunCompleted를 구독해 축하 메시지를 생성한다.
// groupId는 레포 전체에서 유일해야 한다.
export function createRunCompletedConsumer(onMessage: (eventId: string, payload: RunCompletedEventPayload) => Promise<void>) {
  const kafka = new Kafka({ clientId: 'ai-assistant-service', brokers: KAFKA_BROKERS, logLevel: 1 });
  const consumer = kafka.consumer({ groupId: 'ai-assistant-service' });
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
