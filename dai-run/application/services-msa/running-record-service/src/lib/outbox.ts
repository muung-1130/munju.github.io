import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { RUN_COMPLETED_EVENTS_TOPIC, type RunCompletedEventPayload } from './kafka.js';

// finishRun과 같은 트랜잭션에 참여 중인 client를 그대로 받아서 쓴다 — 별도 pool.query()를 열면
// 업무 데이터 UPDATE와 이 INSERT가 원자적으로 묶이지 않아 Outbox의 존재 의미가 없어진다.
export async function writeRunCompletedOutboxEvent(client: PoolClient, payload: RunCompletedEventPayload): Promise<string> {
  const eventId = randomUUID();
  await client.query(
    `INSERT INTO running_record.outbox_events (event_id, topic, event_type, aggregate_id, payload)
     VALUES ($1, $2, 'RunCompleted', $3, $4)`,
    [eventId, RUN_COMPLETED_EVENTS_TOPIC, payload.runId, JSON.stringify(payload)]
  );
  return eventId;
}
