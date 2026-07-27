import { randomUUID } from 'crypto';
import { Kafka, Partitioners } from 'kafkajs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? '192.168.0.201:29092').split(',');
export const COURSE_LIKE_EVENTS_TOPIC = 'course.like-events';

let producer: ReturnType<Kafka['producer']> | undefined;

function getProducer() {
  if (!producer) {
    const kafka = new Kafka({ clientId: 'course-service', brokers: KAFKA_BROKERS, logLevel: 1 });
    producer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });
  }
  return producer;
}

type CourseLikeEvent = {
  eventId: string;
  eventType: 'CourseLiked' | 'CourseUnliked';
  occurredAt: string;
  producer: string;
  aggregateId: string;
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
    producer: 'course-service',
    aggregateId: courseId,
    schemaVersion: 1,
    traceId: randomUUID(),
    payload: { courseId, userId }
  };

  const p = getProducer();
  await p.connect();
  await p.send({
    topic: COURSE_LIKE_EVENTS_TOPIC,
    messages: [{ key: courseId, value: JSON.stringify(event) }]
  });
}
