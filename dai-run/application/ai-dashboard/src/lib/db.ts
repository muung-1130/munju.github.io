import { Pool } from "pg";

/**
 * Read-only PostgreSQL observability queries against the real dev database.
 * Every query here only touches pg_catalog / pg_stat_* system views — never
 * application tables. On any failure (unreachable, timeout, bad credentials)
 * this returns `null` so callers fall back to the simulated DbStats.
 */

let pool: Pool | null = null;

function getPool(): Pool | null {
  if (!process.env.PGHOST) return null;
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      max: 3,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 30_000,
    });
    // A pooled client can emit a background 'error' after being returned idle
    // (e.g. the server closes it); without a listener this crashes the process.
    pool.on("error", () => {});
  }
  return pool;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export type LiveDbStats = {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
  waitingLocks: number;
  longestQuerySeconds: number;
  databaseSizeMb: number;
  cacheHitRatioPct: number;
};

export async function getLiveDbStats(): Promise<LiveDbStats | null> {
  const p = getPool();
  if (!p) return null;

  try {
    // Each of these acquires its own pooled connection (pool max: 3), so they can
    // safely run concurrently — a single checked-out Client must not be handed
    // multiple in-flight queries at once (pg deprecates that usage).
    const [activity, maxConn, locks, size, hit] = await withTimeout(
      Promise.all([
        p.query(
          `select
             count(*) filter (where state = 'active') as active,
             count(*) filter (where state = 'idle') as idle,
             count(*) as total,
             coalesce(max(extract(epoch from (now() - query_start))), 0) as longest
           from pg_stat_activity`,
        ),
        p.query(`show max_connections`),
        p.query(`select count(*) as waiting from pg_locks where not granted`),
        p.query(`select pg_database_size(current_database()) as bytes`),
        p.query(`select coalesce(sum(blks_hit), 0) as hit, coalesce(sum(blks_read), 0) as read from pg_stat_database`),
      ]),
      2500,
    );

    const hitBlocks = parseInt(hit.rows[0].hit, 10);
    const readBlocks = parseInt(hit.rows[0].read, 10);
    const total = hitBlocks + readBlocks;

    return {
      totalConnections: parseInt(activity.rows[0].total, 10),
      activeConnections: parseInt(activity.rows[0].active, 10),
      idleConnections: parseInt(activity.rows[0].idle, 10),
      maxConnections: parseInt(maxConn.rows[0].max_connections, 10),
      waitingLocks: parseInt(locks.rows[0].waiting, 10),
      longestQuerySeconds: Math.round(parseFloat(activity.rows[0].longest) * 10) / 10,
      databaseSizeMb: Math.round((parseInt(size.rows[0].bytes, 10) / 1024 / 1024) * 10) / 10,
      cacheHitRatioPct: total > 0 ? Math.round((hitBlocks / total) * 1000) / 10 : 100,
    };
  } catch {
    return null;
  }
}
