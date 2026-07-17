import { randomUUID } from 'crypto';
import { Kafka, Partitioners } from 'kafkajs';

// team4 공용 Kafka 브로커. 이 Next.js 컨테이너는 브로커와 다른 도커 네트워크에 있어 컨테이너
// 호스트네임(kafka-broker:9092)으로는 못 붙고, 호스트에 노출된 EXTERNAL 리스너로 접속한다.
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.201:29092').split(',');
export const COURSE_LIKE_EVENTS_TOPIC = 'course.like-events';

declare global {
  // eslint-disable-next-line no-var
  var __kafkaProducer: ReturnType<Kafka['producer']> | undefined;
}

function getProducer() {
  if (!global.__kafkaProducer) {
    const kafka = new Kafka({ clientId: 'dai-run-next', brokers: KAFKA_BROKERS, logLevel: 1 });
    global.__kafkaProducer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });
  }
  return global.__kafkaProducer;
}

type CourseLikeEvent = {
  eventId: string;
  eventType: 'CourseLiked' | 'CourseUnliked';
  occurredAt: string;
  producer: string;
  aggregateId: string; // course_id
  schemaVersion: number;
  traceId: string;
  payload: { courseId: string; userId: string };
};

// 찜 버튼을 누르면 course.course_likes는 이 API 요청 안에서 바로 쓰지만, 집계 테이블
// (course.course_statistics.like_count)은 이 이벤트를 별도 consumer가 비동기로 처리해 갱신한다.
export async function publishCourseLikeEvent(courseId: string, userId: string, liked: boolean) {
  const event: CourseLikeEvent = {
    eventId: randomUUID(),
    eventType: liked ? 'CourseLiked' : 'CourseUnliked',
    occurredAt: new Date().toISOString(),
    producer: 'dai-run-next',
    aggregateId: courseId,
    schemaVersion: 1,
    traceId: randomUUID(),
    payload: { courseId, userId }
  };

  const producer = getProducer();
  await producer.connect();
  await producer.send({
    topic: COURSE_LIKE_EVENTS_TOPIC,
    messages: [{ key: courseId, value: JSON.stringify(event) }]
  });
}
