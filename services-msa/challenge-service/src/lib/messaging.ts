import { randomUUID } from 'crypto';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import {
  publishChallengeCompletedEvent as publishChallengeCompletedToKafka,
  type ChallengeCompletedEventPayload
} from './kafka.js';

const sns = new SNSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });

export async function publishChallengeCompletedEvent(eventId: string, payload: ChallengeCompletedEventPayload) {
  const provider = (process.env.MESSAGING_PROVIDER ?? 'kafka').trim().toLowerCase();
  if (provider === 'kafka') return publishChallengeCompletedToKafka(eventId, payload);
  if (provider !== 'sns-sqs' && provider !== 'sns') {
    throw new Error(`지원하지 않는 MESSAGING_PROVIDER: ${provider}`);
  }

  const topicArn = process.env.CHALLENGE_EVENTS_TOPIC_ARN;
  if (!topicArn) throw new Error('CHALLENGE_EVENTS_TOPIC_ARN 환경변수가 필요합니다.');
  const event = {
    eventId,
    eventType: 'ChallengeCompleted',
    occurredAt: new Date().toISOString(),
    producer: 'challenge-service',
    aggregateId: payload.challengeId,
    schemaVersion: 1,
    traceId: randomUUID(),
    payload
  };
  await sns.send(new PublishCommand({
    TopicArn: topicArn,
    Message: JSON.stringify(event),
    MessageAttributes: { eventType: { DataType: 'String', StringValue: event.eventType } }
  }));
}
