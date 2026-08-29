// crew-service의 API 프로세스와 별도 컨테이너로 뜨는 워커 entrypoint다. running-record-service가
// 발행하는 RunCompleted를 구독해, 이 서비스 자신의(최신) 배틀 상태머신으로 진행 중인 배틀을
// 갱신한다.
import { createRunCompletedConsumer, type RunCompletedEventPayload } from './lib/kafka.js';
import { refreshCrewBattlesForUser } from './lib/crewBattle.js';
import { createSqsDomainConsumer } from './lib/sqsConsumer.js';

const messagingProvider = (process.env.MESSAGING_PROVIDER ?? 'kafka').trim().toLowerCase();
const onRunCompleted = async (_eventId: string, payload: RunCompletedEventPayload) => {
  await refreshCrewBattlesForUser(payload.userId);
};

const consumer =
  messagingProvider === 'sns-sqs' || messagingProvider === 'sqs'
    ? createSqsDomainConsumer({
        queueUrl: process.env.RUN_COMPLETED_QUEUE_URL,
        allowedEventTypes: ['RunCompleted'],
        serviceName: 'crew-service',
        onMessage: async (event) => onRunCompleted(event.eventId, event.payload as RunCompletedEventPayload)
      })
    : messagingProvider === 'kafka'
      ? createRunCompletedConsumer(onRunCompleted)
      : (() => {
          throw new Error(`지원하지 않는 MESSAGING_PROVIDER: ${messagingProvider}`);
        })();

console.log(`crew-service consumer starting (provider=${messagingProvider})`);
consumer
  .start()
  .then(() => console.log('crew-service consumer started'))
  .catch((err) => {
    console.error('crew-service consumer 시작 실패:', err);
    process.exit(1);
  });
