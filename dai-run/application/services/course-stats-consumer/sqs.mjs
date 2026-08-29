import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

const WAIT_TIME_SECONDS = 20;
const RETRY_DELAY_MS = 5000;

export function parseSqsEvent(body, allowedEventTypes) {
  let event = JSON.parse(body);
  if (event && event.Type === 'Notification' && typeof event.Message === 'string') event = JSON.parse(event.Message);
  if (!event || typeof event !== 'object' || typeof event.eventId !== 'string' || !event.eventId) {
    throw new Error('유효한 eventId가 없습니다.');
  }
  if (!allowedEventTypes.includes(event.eventType) || !event.payload || typeof event.payload !== 'object') {
    throw new Error(`지원하지 않는 이벤트입니다: ${String(event.eventType)}`);
  }
  return event;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startSqsConsumer({ queueUrl, allowedEventTypes, serviceName, onMessage }) {
  if (!queueUrl) throw new Error(`${serviceName} SQS queue URL 환경변수가 필요합니다.`);
  const client = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });
  console.log(`[sqs] ${serviceName} started (queue=${new URL(queueUrl).pathname.split('/').pop()})`);
  for (;;) {
    let messages;
    try {
      const response = await client.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 1, WaitTimeSeconds: WAIT_TIME_SECONDS }));
      messages = response.Messages ?? [];
    } catch (error) {
      console.error(`[sqs] ${serviceName} ReceiveMessage 실패, 재시도합니다:`, error);
      await delay(RETRY_DELAY_MS);
      continue;
    }
    for (const message of messages) {
      try {
        if (!message.Body || !message.ReceiptHandle) throw new Error('SQS 메시지 본문 또는 ReceiptHandle이 없습니다.');
        const event = parseSqsEvent(message.Body, allowedEventTypes);
        await onMessage(event);
        await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
        console.log(`[sqs] ${serviceName} 처리 및 삭제 완료 (eventId=${event.eventId})`);
      } catch (error) {
        console.error(`[sqs] ${serviceName} 처리 실패; 메시지를 삭제하지 않습니다:`, error);
      }
    }
  }
}
