import { Pool } from "pg";

/**
 * Durable local record of every Alertmanager notification attempt, kept in
 * `dashboard_observability.alert_notifications` (own schema, separate from
 * the dai_run application tables). Alertmanager's Slack delivery to the
 * public internet has shown intermittent TLS handshake timeouts from this
 * host; this table is a same-network fallback so a firing/resolved event is
 * never silently lost even if Slack delivery itself fails.
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

type AlertmanagerWebhookAlert = {
  status: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt?: string;
  endsAt?: string;
  fingerprint?: string;
};

export async function recordAlertWebhookPayload(alerts: AlertmanagerWebhookAlert[]): Promise<void> {
  const p = getPool();
  if (!p || alerts.length === 0) return;

  await Promise.all(
    alerts.map((a) =>
      p.query(
        `insert into dashboard_observability.alert_notifications
           (fingerprint, alertname, job, severity, status, summary, description, starts_at, ends_at, payload)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          a.fingerprint ?? `${a.labels?.alertname ?? "unknown"}-${a.startsAt ?? ""}`,
          a.labels?.alertname ?? null,
          a.labels?.job ?? a.labels?.name ?? null,
          a.labels?.severity ?? null,
          a.status,
          a.annotations?.summary ?? null,
          a.annotations?.description ?? null,
          a.startsAt ? new Date(a.startsAt) : null,
          a.endsAt && a.endsAt !== "0001-01-01T00:00:00Z" ? new Date(a.endsAt) : null,
          JSON.stringify(a),
        ],
      ),
    ),
  );
}

export type LiveAlertNotification = {
  alertname: string | null;
  job: string | null;
  severity: string | null;
  status: string;
  summary: string | null;
  receivedAt: string;
};

export async function getLiveAlertNotifications(limit = 10): Promise<LiveAlertNotification[] | null> {
  const p = getPool();
  if (!p) return null;

  try {
    const result = await Promise.race([
      p.query(
        `select alertname, job, severity, status, summary, received_at
         from dashboard_observability.alert_notifications
         order by received_at desc
         limit $1`,
        [limit],
      ),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2500)),
    ]);

    return result.rows.map((r) => ({
      alertname: r.alertname,
      job: r.job,
      severity: r.severity,
      status: r.status,
      summary: r.summary,
      receivedAt: r.received_at.toISOString(),
    }));
  } catch {
    return null;
  }
}
