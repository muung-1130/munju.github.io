// crew-service의 API 프로세스와 별도 컨테이너로 뜨는 워커 entrypoint다. running-record-service가
// 발행하는 RunCompleted를 구독해, 이 서비스 자신의(최신) 배틀 상태머신으로 진행 중인 배틀을
// 갱신한다. running-record-service의 구버전 crewBattle.ts 사본은 슬라이스 4에서 제거한다.
import { createRunCompletedConsumer } from './lib/kafka.js';
import { refreshCrewBattlesForUser } from './lib/crewBattle.js';

const consumer = createRunCompletedConsumer(async (_eventId, payload) => {
  await refreshCrewBattlesForUser(payload.userId);
});

consumer
  .start()
  .then(() => console.log('crew-service consumer started'))
  .catch((err) => {
    console.error('crew-service consumer 시작 실패:', err);
    process.exit(1);
  });
