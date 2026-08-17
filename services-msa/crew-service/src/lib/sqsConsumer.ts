import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

const WAIT_TIME_SECONDS = 20;
const RETRY_DELAY_MS = 5_000;

export type SqsDomainEvent<TPayload = Record<string, unknown>> = {
  eventId: string;
  eventType: string;
  payload: TPayload;
  aggregateId?: string;
};

type SnsNotification = { Type?: string; Message?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseSqsDomainEvent(body: string, allowedEventTypes: readonly string[]): SqsDomainEvent {
  let parsed: unknown = JSON.parse(body);
  if (isRecord(parsed)) {
    const notification = parsed as SnsNotification;
    if (notification.Type === 'Notification' && typeof notification.Message === 'string') {
      parsed = JSON.parse(notification.Message);
    }
  }
  if (!isRecord(parsed) || typeof parsed.eventId !== 'string' || !parsed.eventId) {
    throw new Error('유효한 eventId가 없습니다.');
  }
  if (typeof parsed.eventType !== 'string' || !allowedEventTypes.includes(parsed.eventType)) {
    throw new Error(`지원하지 않는 eventType: ${String(parsed.eventType)}`);
  }
  if (!isRecord(parsed.payload)) {
    throw new Error('이벤트 payload가 객체가 아닙니다.');
  }
  return parsed as SqsDomainEvent;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createSqsDomainConsumer(options: {
  queueUrl: string | undefined;
  allowedEventTypes: readonly string[];
  serviceName: string;
  onMessage: (event: SqsDomainEvent) => Promise<void>;
}) {
  const client = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });
  return {
    async start(): Promise<void> {
      if (!options.queueUrl) throw new Error(`${options.serviceName} SQS queue URL 환경변수가 필요합니다.`);
      const queueName = new URL(options.queueUrl).pathname.split('/').pop();
      console.log(`[sqs] ${options.serviceName} started (queue=${queueName})`);
      for (;;) {
        let messages;
        try {
          const response = await client.send(new ReceiveMessageCommand({
            QueueUrl: options.queueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: WAIT_TIME_SECONDS
          }));
          messages = response.Messages ?? [];
        } catch (error) {
          console.error(`[sqs] ${options.serviceName} ReceiveMessage 실패, 재시도합니다:`, error);
          await delay(RETRY_DELAY_MS);
          continue;
        }
        for (const message of messages) {
          try {
            if (!message.Body || !message.ReceiptHandle) throw new Error('SQS 메시지 본문 또는 ReceiptHandle이 없습니다.');
            const event = parseSqsDomainEvent(message.Body, options.allowedEventTypes);
            await options.onMessage(event);
            await client.send(new DeleteMessageCommand({ QueueUrl: options.queueUrl, ReceiptHandle: message.ReceiptHandle }));
            console.log(`[sqs] ${options.serviceName} 처리 및 삭제 완료 (eventId=${event.eventId})`);
          } catch (error) {
            console.error(`[sqs] ${options.serviceName} 처리 실패; 메시지를 삭제하지 않습니다:`, error);
          }
        }
      }
    }
  };
}
