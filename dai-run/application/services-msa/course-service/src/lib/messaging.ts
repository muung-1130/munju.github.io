import { randomUUID } from 'crypto';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { publishCourseLikeEvent as publishCourseLikeToKafka } from './kafka.js';

const sns = new SNSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });

export async function publishCourseLikeEvent(courseId: string, userId: string, liked: boolean) {
  const provider = (process.env.MESSAGING_PROVIDER ?? 'kafka').trim().toLowerCase();
  if (provider === 'kafka') return publishCourseLikeToKafka(courseId, userId, liked);
  if (provider !== 'sns-sqs' && provider !== 'sns') {
    throw new Error(`지원하지 않는 MESSAGING_PROVIDER: ${provider}`);
  }

  const topicArn = process.env.COURSE_EVENTS_TOPIC_ARN;
  if (!topicArn) throw new Error('COURSE_EVENTS_TOPIC_ARN 환경변수가 필요합니다.');
  const event = {
    eventId: randomUUID(),
    eventType: liked ? 'CourseLiked' : 'CourseUnliked',
    occurredAt: new Date().toISOString(),
    producer: 'course-service',
    aggregateId: courseId,
    schemaVersion: 1,
    traceId: randomUUID(),
    payload: { courseId, userId }
  };
  await sns.send(new PublishCommand({
    TopicArn: topicArn,
    Message: JSON.stringify(event),
    MessageAttributes: { eventType: { DataType: 'String', StringValue: event.eventType } }
  }));
}
