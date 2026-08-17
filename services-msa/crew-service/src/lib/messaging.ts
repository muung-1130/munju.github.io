import { randomUUID } from 'crypto';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import {
  publishBattleDeclinedEvent as publishBattleDeclinedToKafka,
  publishBattleStartedEvent as publishBattleStartedToKafka,
  publishCrewJoinRequestEvent as publishCrewJoinRequestToKafka
} from './kafka.js';

const sns = new SNSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });

async function publishEvent(event: Record<string, unknown>): Promise<void> {
  const topicArn = process.env.CREW_EVENTS_TOPIC_ARN;
  if (!topicArn) throw new Error('CREW_EVENTS_TOPIC_ARN 환경변수가 필요합니다.');
  await sns.send(new PublishCommand({
    TopicArn: topicArn,
    Message: JSON.stringify(event),
    MessageAttributes: { eventType: { DataType: 'String', StringValue: String(event.eventType) } }
  }));
}

function provider(): string {
  return (process.env.MESSAGING_PROVIDER ?? 'kafka').trim().toLowerCase();
}

function requireSnsProvider(value: string): void {
  if (value !== 'sns-sqs' && value !== 'sns') throw new Error(`지원하지 않는 MESSAGING_PROVIDER: ${value}`);
}

export async function publishCrewJoinRequestEvent(
  payload: Parameters<typeof publishCrewJoinRequestToKafka>[0],
  eventType: Parameters<typeof publishCrewJoinRequestToKafka>[1]
) {
  const selected = provider();
  if (selected === 'kafka') return publishCrewJoinRequestToKafka(payload, eventType);
  requireSnsProvider(selected);
  await publishEvent({
    eventId: randomUUID(), eventType, occurredAt: new Date().toISOString(), producer: 'crew-service',
    aggregateId: payload.joinRequestId, schemaVersion: 1, traceId: randomUUID(), payload
  });
}

export async function publishBattleDeclinedEvent(payload: Parameters<typeof publishBattleDeclinedToKafka>[0]) {
  const selected = provider();
  if (selected === 'kafka') return publishBattleDeclinedToKafka(payload);
  requireSnsProvider(selected);
  await publishEvent({
    eventId: randomUUID(), eventType: 'BattleDeclined', occurredAt: new Date().toISOString(), producer: 'crew-service',
    aggregateId: payload.battleId, schemaVersion: 1, traceId: randomUUID(), payload
  });
}

export async function publishBattleStartedEvent(payload: Parameters<typeof publishBattleStartedToKafka>[0]) {
  const selected = provider();
  if (selected === 'kafka') return publishBattleStartedToKafka(payload);
  requireSnsProvider(selected);
  await publishEvent({
    eventId: randomUUID(), eventType: 'BattleStarted', occurredAt: new Date().toISOString(), producer: 'crew-service',
    aggregateId: payload.battleId, schemaVersion: 1, traceId: randomUUID(), payload
  });
}
