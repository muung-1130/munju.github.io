// running.run-completed-events 토픽을 구독해서, 러닝 완료 후처리(챌린지 진행도 갱신, 크루 배틀
// 즉시 재계산, AI 코치 축하 메시지)를 Next.js의 내부 전용 API 한 번 호출로 위임한다. 이 소비자
// 자체는 DB에 직접 쓰지 않는다 — 실제 도메인 로직(challenge/crew/ai_assistant 스키마 소유권)은
// 전부 Next.js lib 코드에 그대로 두고, 여기서는 순수하게 Kafka → HTTP 브릿지 역할만 한다.
import { Kafka } from 'kafkajs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.201:29092').split(',');
const TOPIC = 'running.run-completed-events';
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://next-app:3000/api/internal/run-completed';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

const kafka = new Kafka({ clientId: 'run-completion-consumer', brokers: KAFKA_BROKERS, logLevel: 1 });
const consumer = kafka.consumer({ groupId: 'run-completion-consumer' });

async function main() {
  if (!INTERNAL_API_SECRET) {
    console.error('[run-completion-consumer] INTERNAL_API_SECRET이 설정되지 않았어요. 종료합니다.');
    process.exit(1);
  }

  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({ topics: [{ topic: TOPIC, numPartitions: 1, replicationFactor: 1 }], waitForLeaders: true });
    console.log(`[run-completion-consumer] topic ${TOPIC} ready`);
  } catch (err) {
    console.log(`[run-completion-consumer] createTopics 건너뜀(이미 존재하거나 권한 없음): ${err.message}`);
  } finally {
    await admin.disconnect();
  }

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`[run-completion-consumer] subscribed to ${TOPIC}, forwarding to ${INTERNAL_API_URL}`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      let event;
      try {
        event = JSON.parse(message.value.toString());
      } catch (err) {
        console.error('[run-completion-consumer] 잘못된 메시지, 건너뜀:', err.message);
        return;
      }
      if (event.eventType !== 'RunCompleted') return;

      try {
        const res = await fetch(INTERNAL_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_API_SECRET },
          body: JSON.stringify({ eventId: event.eventId, payload: event.payload })
        });
        if (!res.ok) {
          console.error(`[run-completion-consumer] run=${event.payload.runId} 처리 실패 (HTTP ${res.status}):`, await res.text());
          return;
        }
        const data = await res.json();
        console.log(
          `[run-completion-consumer] run=${event.payload.runId} 처리 완료`,
          data.completedChallengeNames?.length ? `완료된 챌린지: ${data.completedChallengeNames.join(', ')}` : ''
        );
      } catch (err) {
        console.error(`[run-completion-consumer] run=${event.payload?.runId} 요청 실패:`, err.message);
      }
    }
  });
}

main().catch((err) => {
  console.error('[run-completion-consumer] fatal error:', err);
  process.exit(1);
});
