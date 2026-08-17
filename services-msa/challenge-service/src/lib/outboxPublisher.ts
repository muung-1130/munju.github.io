import { getPool } from './db.js';
import { publishChallengeCompletedEvent } from './messaging.js';

const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 50;

let timer: ReturnType<typeof setInterval> | undefined;
let polling = false;

async function pollOnce(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT event_id, aggregate_id, payload
         FROM challenge.outbox_events
        WHERE published_at IS NULL
        ORDER BY occurred_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );

    for (const row of rows) {
      await publishChallengeCompletedEvent(row.event_id, row.payload);
      await client.query(`UPDATE challenge.outbox_events SET published_at = now() WHERE event_id = $1`, [row.event_id]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('challenge outbox publish 실패:', err);
  } finally {
    client.release();
  }
}

export function startOutboxPublisher(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (polling) return;
    polling = true;
    pollOnce()
      .catch((err) => console.error('challenge outbox poll 루프 실패:', err))
      .finally(() => {
        polling = false;
      });
  }, POLL_INTERVAL_MS);
}
