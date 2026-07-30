// ai-assistant-service의 API 프로세스와 별도 컨테이너로 뜨는 워커 entrypoint다. running-record-service가
// 발행하는 RunCompleted를 구독해 축하 메시지를 생성한다.
//
// 참고: 예전에는 running-record-service가 이 축하 메시지에 "완주한 챌린지 이름" 보너스 문구까지
// 넣어줬다(챌린지 진행도 갱신과 축하 메시지 생성을 한 서비스가 동기 호출로 묶어서 처리했기 때문).
// 서비스 경계를 나눈 지금은 이 컨슈머가 챌린지 완주 여부를 알 방법이 없다(그걸 알려면 challenge
// 스키마를 직접 조회하거나 동기 호출이 필요한데, 축하 메시지의 장식적인 한 줄을 위해 그런 결합을
// 만들 가치는 없다고 판단했다) — 그래서 완주 챌린지 목록은 항상 빈 배열로 넘긴다. 챌린지 달성
// 알림 자체는 notification-service가 ChallengeCompleted 이벤트로 별도 처리한다.
import { createRunCompletedConsumer } from './lib/kafka.js';
import { sendRunCongratsMessage } from './lib/aiChatMessages.js';

const consumer = createRunCompletedConsumer(async (eventId, payload) => {
  await sendRunCongratsMessage(eventId, payload.userId, payload, []);
});

consumer
  .start()
  .then(() => console.log('ai-assistant-service consumer started'))
  .catch((err) => {
    console.error('ai-assistant-service consumer 시작 실패:', err);
    process.exit(1);
  });
