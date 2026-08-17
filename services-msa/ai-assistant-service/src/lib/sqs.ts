import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { RunCompletedEventPayload } from './kafka.js';

const WAIT_TIME_SECONDS = 20;
const RETRY_DELAY_MS = 5_000;

type RunCompletedEvent = {
  eventId: string;
  eventType: 'RunCompleted';
  payload: RunCompletedEventPayload;
};

type SnsNotification = {
  Type?: string;
  Message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// 운영 SNS 구독은 RawMessageDelivery=true지만, 복구·재구성 시 기본 SNS envelope로
// 바뀌어도 같은 consumer가 동작하도록 두 형식을 모두 허용한다.
export function parseRunCompletedEvent(body: string): RunCompletedEvent {
  let parsed: unknown = JSON.parse(body);
  if (isRecord(parsed)) {
    const notification = parsed as SnsNotification;
    if (notification.Type === 'Notification' && typeof notification.Message === 'string') {
      parsed = JSON.parse(notification.Message);
    }
  }

  if (!isRecord(parsed) || parsed.eventType !== 'RunCompleted') {
    throw new Error('RunCompleted 이벤트가 아닙니다.');
  }
  if (typeof parsed.eventId !== 'string' || !parsed.eventId) {
    throw new Error('RunCompleted eventId가 없습니다.');
  }
  if (!isRecord(parsed.payload) || typeof parsed.payload.userId !== 'string') {
    throw new Error('RunCompleted payload가 올바르지 않습니다.');
  }

  return parsed as RunCompletedEvent;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRunCompletedSqsConsumer(
  onMessage: (eventId: string, payload: RunCompletedEventPayload) => Promise<void>
) {
  const queueUrl = process.env.RUN_COMPLETED_QUEUE_URL ?? process.env.SQS_RUN_COMPLETED_QUEUE_URL;
  const client = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });

  return {
    async start(): Promise<void> {
      if (!queueUrl) {
        throw new Error('RUN_COMPLETED_QUEUE_URL 환경변수가 필요합니다.');
      }

      console.log(`[sqs] RunCompleted consumer started (queue=${new URL(queueUrl).pathname.split('/').pop()})`);
      for (;;) {
        let messages;
        try {
          const response = await client.send(
            new ReceiveMessageCommand({
              QueueUrl: queueUrl,
              MaxNumberOfMessages: 1,
              WaitTimeSeconds: WAIT_TIME_SECONDS
            })
          );
          messages = response.Messages ?? [];
        } catch (err) {
          console.error('[sqs] ReceiveMessage 실패, 재시도합니다:', err);
          await delay(RETRY_DELAY_MS);
          continue;
        }

        for (const message of messages) {
          try {
            if (!message.Body || !message.ReceiptHandle) {
              throw new Error('SQS 메시지 본문 또는 ReceiptHandle이 없습니다.');
            }
            const event = parseRunCompletedEvent(message.Body);
            await onMessage(event.eventId, event.payload);
            await client.send(
              new DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: message.ReceiptHandle
              })
            );
            console.log(`RunCompleted SQS 처리 및 삭제 완료 (eventId=${event.eventId})`);
          } catch (err) {
            // 처리 실패 메시지는 삭제하지 않는다. VisibilityTimeout 후 재시도되고,
            // maxReceiveCount를 넘으면 운영 DLQ로 이동한다.
            console.error('[sqs] RunCompleted 처리 실패; 메시지를 삭제하지 않습니다:', err);
          }
        }
      }
    }
  };
}
