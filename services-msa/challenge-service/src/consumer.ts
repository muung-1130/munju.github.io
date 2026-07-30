// challenge-service의 API 프로세스(src/index.ts)와 별도 컨테이너로 뜨는 워커 entrypoint다.
// 1) running-record-service가 발행하는 RunCompleted를 구독해 챌린지 진행도를 갱신하고
// 2) 이 서비스 자신이 발행하는 ChallengeCompleted를 outbox에서 폴링해 Kafka로 내보낸다.
import { applyChallengeProgress } from './lib/challengeRules.js';
import { createRunCompletedConsumer } from './lib/kafka.js';
import { startOutboxPublisher } from './lib/outboxPublisher.js';

startOutboxPublisher();

const consumer = createRunCompletedConsumer(async (eventId, payload) => {
  await applyChallengeProgress(eventId, payload);
});

consumer
  .start()
  .then(() => console.log('challenge-service consumer started'))
  .catch((err) => {
    console.error('challenge-service consumer 시작 실패:', err);
    process.exit(1);
  });
