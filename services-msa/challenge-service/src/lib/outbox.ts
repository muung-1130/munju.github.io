import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { CHALLENGE_COMPLETED_EVENTS_TOPIC, type ChallengeCompletedEventPayload } from './kafka.js';

// applyChallengeProgress가 이미 열어둔 트랜잭션의 client를 그대로 받는다 — challenge_participations
// 갱신과 이 INSERT가 원자적으로 묶여야 Outbox 패턴의 의미가 있다.
export async function writeChallengeCompletedOutboxEvent(client: PoolClient, payload: ChallengeCompletedEventPayload): Promise<string> {
  const eventId = randomUUID();
  await client.query(
    `INSERT INTO challenge.outbox_events (event_id, topic, event_type, aggregate_id, payload)
     VALUES ($1, $2, 'ChallengeCompleted', $3, $4)`,
    [eventId, CHALLENGE_COMPLETED_EVENTS_TOPIC, payload.challengeId, JSON.stringify(payload)]
  );
  return eventId;
}
