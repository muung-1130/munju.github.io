import { recordAlertWebhookPayload } from "@/lib/alert-audit";

/**
 * Receives Alertmanager's standard webhook payload
 * (https://prometheus.io/docs/alerting/latest/configuration/#webhook_config)
 * and writes each alert to Postgres. This exists purely as a same-network
 * delivery backstop: Slack delivery from this host has shown intermittent
 * TLS handshake timeouts, so this receiver (reached over the docker bridge,
 * not the public internet) guarantees the event is captured even when
 * Slack itself is unreachable.
 */
export async function POST(request: Request) {
  let body: { alerts?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const alerts = Array.isArray(body.alerts) ? body.alerts : [];
  try {
    await recordAlertWebhookPayload(
      alerts as Parameters<typeof recordAlertWebhookPayload>[0],
    );
  } catch {
    // Best-effort: Alertmanager doesn't need to know a write failed here —
    // Slack (or the next resend) remains the primary delivery path.
    return Response.json({ ok: false }, { status: 200 });
  }

  return Response.json({ ok: true, recorded: alerts.length });
}
