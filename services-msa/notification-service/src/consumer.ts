// notification-service의 API 프로세스와 별도 컨테이너로 뜨는 워커 entrypoint다.
// challenge-service가 발행하는 ChallengeCompleted를 구독해 notification.notifications에 반영한다.
import { createChallengeCompletedConsumer, type ChallengeCompletedEventPayload } from './lib/kafka.js';
import { createChallengeCompletedNotification } from './lib/notifications.js';
import { createSqsDomainConsumer } from './lib/sqsConsumer.js';

const messagingProvider = (process.env.MESSAGING_PROVIDER ?? 'kafka').trim().toLowerCase();
const onChallengeCompleted = async (eventId: string, payload: ChallengeCompletedEventPayload) => {
  await createChallengeCompletedNotification(eventId, payload);
};

const consumer =
  messagingProvider === 'sns-sqs' || messagingProvider === 'sqs'
    ? createSqsDomainConsumer({
        queueUrl: process.env.CHALLENGE_COMPLETED_QUEUE_URL,
        allowedEventTypes: ['ChallengeCompleted'],
        serviceName: 'notification-service',
        onMessage: async (event) => onChallengeCompleted(event.eventId, event.payload as ChallengeCompletedEventPayload)
      })
    : messagingProvider === 'kafka'
      ? createChallengeCompletedConsumer(onChallengeCompleted)
      : (() => {
          throw new Error(`지원하지 않는 MESSAGING_PROVIDER: ${messagingProvider}`);
        })();

console.log(`notification-service consumer starting (provider=${messagingProvider})`);
consumer
  .start()
  .then(() => console.log('notification-service consumer started'))
  .catch((err) => {
    console.error('notification-service consumer 시작 실패:', err);
    process.exit(1);
  });
