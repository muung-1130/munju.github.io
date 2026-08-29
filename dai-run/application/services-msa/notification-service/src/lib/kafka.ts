import { Kafka } from 'kafkajs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.212:29092').split(',');
export const CHALLENGE_COMPLETED_EVENTS_TOPIC = 'challenge.challenge-completed-events';

export type ChallengeCompletedEventPayload = {
  userId: string;
  challengeId: string;
  challengeName: string;
};

// challenge-service가 발행하는 ChallengeCompleted를 구독해 notification.notifications에
// 반영한다 — challenge-service가 이 스키마에 직접 쓰던 것을 대체한다. groupId는 레포 전체에서
// 유일해야 한다(challenge-service, crew-service 등 다른 컨슈머와 겹치면 안 됨).
export function createChallengeCompletedConsumer(
  onMessage: (eventId: string, payload: ChallengeCompletedEventPayload) => Promise<void>
) {
  const kafka = new Kafka({ clientId: 'notification-service', brokers: KAFKA_BROKERS, logLevel: 1 });
  const consumer = kafka.consumer({ groupId: 'notification-service' });
  const admin = kafka.admin();

  return {
    async start() {
      await admin.connect();
      try {
        await admin.createTopics({ topics: [{ topic: CHALLENGE_COMPLETED_EVENTS_TOPIC, numPartitions: 1 }] });
      } catch (err) {
        console.error('createTopics(이미 존재하면 무시):', err);
      }
      await admin.disconnect();

      await consumer.connect();
      await consumer.subscribe({ topic: CHALLENGE_COMPLETED_EVENTS_TOPIC, fromBeginning: false });
      await consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          const event = JSON.parse(message.value.toString());
          if (event.eventType !== 'ChallengeCompleted') return;
          try {
            await onMessage(event.eventId, event.payload);
            console.log(`ChallengeCompleted 처리 완료 (eventId=${event.eventId})`);
          } catch (err) {
            console.error(`ChallengeCompleted 처리 실패 (eventId=${event.eventId}):`, err);
          }
        }
      });
    }
  };
}
