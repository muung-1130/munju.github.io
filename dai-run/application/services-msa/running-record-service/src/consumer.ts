// running-record-service의 API 프로세스(src/index.ts)와 별도 컨테이너로 뜨는 outbox publisher
// entrypoint다. Express 서버를 띄우지 않고 outbox 폴링만 한다 — API 요청 처리와 발행 루프가
// 같은 이벤트 루프를 공유하지 않게 해서, 한쪽이 지연되도 다른 쪽 헬스체크에 영향이 없게 한다.
import { startOutboxPublisher } from './lib/outboxPublisher.js';

startOutboxPublisher();
console.log('running-record-service outbox publisher started');
