// notification-service의 API 프로세스와 별도 컨테이너로 뜨는 워커 entrypoint다.
// challenge-service가 발행하는 ChallengeCompleted를 구독해 notification.notifications에 반영한다.
import { createChallengeCompletedConsumer } from './lib/kafka.js';
import { createChallengeCompletedNotification } from './lib/notifications.js';

const consumer = createChallengeCompletedConsumer(async (eventId, payload) => {
  await createChallengeCompletedNotification(eventId, payload);
});

consumer
  .start()
  .then(() => console.log('notification-service consumer started'))
  .catch((err) => {
    console.error('notification-service consumer 시작 실패:', err);
    process.exit(1);
  });
