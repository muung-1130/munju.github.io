// course.like-events 토픽을 구독해 course.course_statistics.like_count를 비동기로 갱신하는
// 소비자. Next.js API(app/api/courses/[courseId]/like)가 찜을 누를 때마다 이벤트를 publish하고,
// 이 프로세스가 그걸 받아 집계 테이블에만 반영한다 (course_likes 관계 테이블 자체는 API 요청 안에서
// 이미 동기로 반영됨 — 여기서는 오직 집계용 카운터만 다룬다).
import './otel.mjs';
import { Kafka } from 'kafkajs';
import { Pool } from 'pg';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.212:29092').split(',');
const TOPIC = 'course.like-events';

const kafka = new Kafka({ clientId: 'course-stats-consumer', brokers: KAFKA_BROKERS, logLevel: 1 });
const consumer = kafka.consumer({ groupId: 'course-stats-consumer' });

async function applyLikeDelta(client, courseId, delta) {
  await client.query(
    `INSERT INTO course.course_statistics (course_id, like_count)
     VALUES ($1, GREATEST($2, 0))
     ON CONFLICT (course_id) DO UPDATE
       SET like_count = GREATEST(course.course_statistics.like_count + $2, 0), updated_at = now()`,
    [courseId, delta]
  );
}

async function main() {
  // 단일 Client를 프로세스 수명 내내 붙들고 있으면, 그 커넥션이 네트워크 계층에서 리셋될 때
  // (ECONNRESET) unhandled 'error' event로 프로세스 전체가 죽는다(crew-notification-consumer/
  // crew-stats-scheduler에서 실제로 반복 관측된 크래시와 동일 패턴). Pool로 바꾸면 죽은
  // 커넥션은 자동으로 새로 만들어 쓰므로 자체 복구된다.
  const pg = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    keepAlive: true
  });
  pg.on('error', (err) => {
    console.error('[course-stats-consumer] idle client error', err);
  });
  console.log('[course-stats-consumer] postgres pool ready');

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`[course-stats-consumer] subscribed to ${TOPIC}`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      let event;
      try {
        event = JSON.parse(message.value.toString());
      } catch (err) {
        console.error('[course-stats-consumer] 잘못된 메시지, 건너뜀:', err.message);
        return;
      }

      const courseId = event.aggregateId ?? event.payload?.courseId;
      if (!courseId) return;

      const delta = event.eventType === 'CourseLiked' ? 1 : event.eventType === 'CourseUnliked' ? -1 : 0;
      if (delta === 0) return;

      try {
        await applyLikeDelta(pg, courseId, delta);
        console.log(`[course-stats-consumer] ${event.eventType} course=${courseId} delta=${delta}`);
      } catch (err) {
        console.error('[course-stats-consumer] like_count 갱신 실패:', err.message);
      }
    }
  });
}

main().catch((err) => {
  console.error('[course-stats-consumer] fatal error:', err);
  process.exit(1);
});
