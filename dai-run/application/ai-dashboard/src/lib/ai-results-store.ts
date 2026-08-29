import { Pool } from "pg";
import type { AiDiagnosisResult } from "./ai-diagnosis";
import type { AiInsightsResult } from "./ai-insights";

/**
 * Persists the last AI diagnosis/insights result per key so it survives page
 * reloads and stays visible until the next "재분석"/"초안 생성" click — these
 * are on-demand, rate-limited, non-cheap calls, so losing the result to a
 * refresh would be wasteful. Tables are created on first use (`ai_dashboard_web_svc`
 * owns the `dashboard_observability` schema, so this doesn't need admin access).
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

let schemaReady: Promise<void> | null = null;

async function ensureSchema(p: Pool): Promise<void> {
  if (!schemaReady) {
    schemaReady = p
      .query(
        `create table if not exists dashboard_observability.ai_diagnosis_results (
           container_job text primary key,
           result jsonb not null,
           generated_at timestamptz not null
         )`,
      )
      .then(() =>
        p.query(
          `create table if not exists dashboard_observability.ai_insights_results (
             id text primary key,
             result jsonb not null,
             generated_at timestamptz not null
           )`,
        ),
      )
      .then(() => undefined)
      .catch(() => {
        schemaReady = null; // allow retry on the next call instead of caching a failure forever
        throw new Error("schema setup failed");
      });
  }
  return schemaReady;
}

export async function getStoredDiagnosis(containerJob: string): Promise<AiDiagnosisResult | null> {
  const p = getPool();
  if (!p) return null;
  try {
    await ensureSchema(p);
    const result = await p.query(
      `select result from dashboard_observability.ai_diagnosis_results where container_job = $1`,
      [containerJob],
    );
    return result.rows[0]?.result ?? null;
  } catch {
    return null;
  }
}

export async function saveDiagnosis(containerJob: string, result: AiDiagnosisResult): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await ensureSchema(p);
    await p.query(
      `insert into dashboard_observability.ai_diagnosis_results (container_job, result, generated_at)
       values ($1, $2, $3)
       on conflict (container_job) do update set result = excluded.result, generated_at = excluded.generated_at`,
      [containerJob, JSON.stringify(result), result.generatedAt],
    );
  } catch {
    // Best-effort — a failed save just means the next page load falls back to "no prior result" rather than crashing.
  }
}

const CLUSTER_INSIGHTS_KEY = "cluster";

export async function getStoredInsights(): Promise<AiInsightsResult | null> {
  const p = getPool();
  if (!p) return null;
  try {
    await ensureSchema(p);
    const result = await p.query(
      `select result from dashboard_observability.ai_insights_results where id = $1`,
      [CLUSTER_INSIGHTS_KEY],
    );
    return result.rows[0]?.result ?? null;
  } catch {
    return null;
  }
}

export async function saveInsights(result: AiInsightsResult): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await ensureSchema(p);
    await p.query(
      `insert into dashboard_observability.ai_insights_results (id, result, generated_at)
       values ($1, $2, $3)
       on conflict (id) do update set result = excluded.result, generated_at = excluded.generated_at`,
      [CLUSTER_INSIGHTS_KEY, JSON.stringify(result), result.generatedAt],
    );
  } catch {
    // Best-effort, same reasoning as saveDiagnosis.
  }
}
