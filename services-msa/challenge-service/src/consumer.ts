// challenge-service의 API 프로세스(src/index.ts)와 별도 컨테이너로 뜨는 워커 entrypoint다.
// 1) running-record-service가 발행하는 RunCompleted를 구독해 챌린지 진행도를 갱신하고
// 2) 이 서비스 자신이 발행하는 ChallengeCompleted를 outbox에서 폴링해 메시징 시스템으로 내보낸다.
import { applyChallengeProgress } from './lib/challengeRules.js';
import { createRunCompletedConsumer } from './lib/kafka.js';
import { startOutboxPublisher } from './lib/outboxPublisher.js';
import { createSqsDomainConsumer } from './lib/sqsConsumer.js';
import type { RunCompletedEventPayload } from './lib/runCompletedEvent.js';

startOutboxPublisher();

const messagingProvider = (process.env.MESSAGING_PROVIDER ?? 'kafka').trim().toLowerCase();
const onRunCompleted = async (eventId: string, payload: RunCompletedEventPayload) => {
  await applyChallengeProgress(eventId, payload);
};

const consumer =
  messagingProvider === 'sns-sqs' || messagingProvider === 'sqs'
    ? createSqsDomainConsumer({
        queueUrl: process.env.RUN_COMPLETED_QUEUE_URL,
        allowedEventTypes: ['RunCompleted'],
        serviceName: 'challenge-service',
        onMessage: async (event) => onRunCompleted(event.eventId, event.payload as RunCompletedEventPayload)
      })
    : messagingProvider === 'kafka'
      ? createRunCompletedConsumer(onRunCompleted)
      : (() => {
          throw new Error(`지원하지 않는 MESSAGING_PROVIDER: ${messagingProvider}`);
        })();

console.log(`challenge-service consumer starting (provider=${messagingProvider})`);
consumer
  .start()
  .then(() => console.log('challenge-service consumer started'))
  .catch((err) => {
    console.error('challenge-service consumer 시작 실패:', err);
    process.exit(1);
  });
