// course.like-events를 받아 course.course_statistics.like_count를 비동기로 갱신한다.
import './otel.mjs';
import { Kafka } from 'kafkajs';
import { Pool } from 'pg';
import { startSqsConsumer } from './sqs.mjs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.212:29092').split(',');
const TOPIC = 'course.like-events';
const messagingProvider = (process.env.MESSAGING_PROVIDER ?? 'kafka').trim().toLowerCase();

async function refreshLikeCount(client, courseId) {
  await client.query(
    `INSERT INTO course.course_statistics (course_id, like_count)
     SELECT $1, COUNT(*)::integer FROM course.course_likes WHERE course_id = $1
     ON CONFLICT (course_id) DO UPDATE
       SET like_count = EXCLUDED.like_count, updated_at = now()`,
    [courseId]
  );
}

async function processEvent(pg, event) {
  const courseId = event.aggregateId ?? event.payload?.courseId;
  if (!courseId) throw new Error('courseId가 없습니다.');
  if (event.eventType !== 'CourseLiked' && event.eventType !== 'CourseUnliked') {
    throw new Error(`지원하지 않는 eventType: ${String(event.eventType)}`);
  }
  await refreshLikeCount(pg, courseId);
  console.log(`[course-stats-consumer] ${event.eventType} course=${courseId} count refreshed`);
}

async function main() {
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
  pg.on('error', (err) => console.error('[course-stats-consumer] idle client error', err));
  await pg.query('SELECT 1');
  console.log('[course-stats-consumer] postgres pool ready');

  if (messagingProvider === 'sns-sqs' || messagingProvider === 'sqs') {
    return startSqsConsumer({
      queueUrl: process.env.COURSE_STATS_QUEUE_URL,
      allowedEventTypes: ['CourseLiked', 'CourseUnliked'],
      serviceName: 'course-stats-consumer',
      onMessage: (event) => processEvent(pg, event)
    });
  }
  if (messagingProvider !== 'kafka') throw new Error(`지원하지 않는 MESSAGING_PROVIDER: ${messagingProvider}`);

  const kafka = new Kafka({ clientId: 'course-stats-consumer', brokers: KAFKA_BROKERS, logLevel: 1 });
  const consumer = kafka.consumer({ groupId: 'course-stats-consumer' });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`[course-stats-consumer] subscribed to ${TOPIC}`);
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        await processEvent(pg, JSON.parse(message.value.toString()));
      } catch (err) {
        console.error('[course-stats-consumer] 처리 실패:', err.message);
      }
    }
  });
}

console.log(`[course-stats-consumer] starting (provider=${messagingProvider})`);
main().catch((err) => {
  console.error('[course-stats-consumer] fatal error:', err);
  process.exit(1);
});
