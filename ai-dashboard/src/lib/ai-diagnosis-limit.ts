import { Pool } from "pg";

/**
 * Cost guardrail for AI diagnosis calls: at most one call per clock hour,
 * tracked in Postgres so the cap survives dev-server restarts. Fails
 * CLOSED — if the DB can't be reached, the call is denied rather than
 * silently allowed, since the whole point is to bound spend.
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
    pool.on("error", () => {});
  }
  return pool;
}

const kstBucketFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

/** e.g. "2026-08-04-09" — one bucket per KST clock hour. */
function currentKstHourBucket(): string {
  const parts = kstBucketFmt.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}-${get("hour")}`;
}

export type RateLimitResult = { allowed: true } | { allowed: false; reason: string };

export async function checkAiDiagnosisRateLimit(): Promise<RateLimitResult> {
  const p = getPool();
  if (!p) {
    return { allowed: false, reason: "사용량 확인 불가로 요청을 거부했습니다 (DB 연결 없음)." };
  }

  try {
    const bucket = currentKstHourBucket();
    const result = await Promise.race([
      p.query(`select count(*)::int as n from dashboard_observability.ai_diagnosis_calls where hour_bucket = $1`, [
        bucket,
      ]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2500)),
    ]);
    if (result.rows[0].n > 0) {
      const hour = parseInt(bucket.slice(-2), 10);
      const nextHour = (hour + 1) % 24;
      return { allowed: false, reason: `이번 시간대(${hour}시)엔 이미 1회 사용했습니다. ${nextHour}시 이후 다시 시도해주세요.` };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: "사용량 확인 중 오류로 요청을 거부했습니다." };
  }
}

export async function recordAiDiagnosisCall(containerJob: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  const bucket = currentKstHourBucket();
  try {
    await p.query(
      `insert into dashboard_observability.ai_diagnosis_calls (hour_bucket, container_job) values ($1, $2)
       on conflict (hour_bucket) do nothing`,
      [bucket, containerJob],
    );
  } catch {
    // Best-effort — if this write fails, the next call this hour might slip
    // through, but we'd rather that than crash a successful diagnosis.
  }
}
