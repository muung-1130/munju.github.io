import { getPool } from './db.js';
import { publishRunCompletedEvent } from './messaging.js';

const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 50;

let timer: ReturnType<typeof setInterval> | undefined;
let polling = false;

// FOR UPDATE SKIP LOCKED로 잡아서, 이 publisher를 두 개 이상 띄워도(배포 중 잠깐 겹치는 경우 등)
// 같은 행을 두 프로세스가 동시에 발행하지 않는다.
async function pollOnce(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT event_id, topic, aggregate_id, payload
         FROM running_record.outbox_events
        WHERE published_at IS NULL
        ORDER BY occurred_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );

    for (const row of rows) {
      await publishRunCompletedEvent(row.event_id, row.payload);
      await client.query(`UPDATE running_record.outbox_events SET published_at = now() WHERE event_id = $1`, [row.event_id]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('outbox publish 실패:', err);
  } finally {
    client.release();
  }
}

export function startOutboxPublisher(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (polling) return; // 이전 폴링이 아직 끝나지 않았으면 겹쳐서 돌리지 않는다.
    polling = true;
    pollOnce()
      .catch((err) => console.error('outbox poll 루프 실패:', err))
      .finally(() => {
        polling = false;
      });
  }, POLL_INTERVAL_MS);
}
