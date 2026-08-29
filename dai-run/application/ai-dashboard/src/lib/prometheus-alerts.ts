import { promInstantQuery } from "./prometheus";

/**
 * Real Stage-1 (static threshold) alert rule state, evaluated by Prometheus
 * itself from monitoring/prometheus/rules/dairun-alert-rules.yml — not
 * computed here. This client only reads the result via /api/v1/rules.
 * See docs/ai-diagnosis-integration-guide.md §3.2 / §7 (roadmap step 1-2).
 */

const PROMETHEUS_URL = process.env.PROMETHEUS_URL ?? "http://localhost:9090";
const FETCH_TIMEOUT_MS = 2500;

export type LiveAlertInstance = { labels: Record<string, string>; state: "pending" | "firing" };

export type LiveAlertRule = {
  name: string;
  /** Worst state across all label combinations this rule currently evaluates. */
  state: "inactive" | "pending" | "firing";
  instances: LiveAlertInstance[];
};

export async function getLiveAlertRuleStates(): Promise<Map<string, LiveAlertRule> | null> {
  try {
    const res = await fetch(new URL("/api/v1/rules", PROMETHEUS_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== "success") return null;

    const map = new Map<string, LiveAlertRule>();
    for (const group of json.data.groups) {
      for (const rule of group.rules) {
        if (rule.type !== "alerting") continue;
        const instances: LiveAlertInstance[] = (rule.alerts ?? [])
          .filter((a: { state: string }) => a.state !== "inactive")
          .map((a: { labels: Record<string, string>; state: string }) => ({ labels: a.labels, state: a.state }));
        map.set(rule.name, { name: rule.name, state: rule.state, instances });
      }
    }
    return map;
  } catch {
    return null;
  }
}

/** Real point-in-time value for a single recording rule (no label filter). */
export async function getLiveRecordingValue(recordName: string): Promise<number | null> {
  const result = await promInstantQuery(recordName);
  if (!result?.length) return null;
  const v = parseFloat(result[0].value[1]);
  return Number.isFinite(v) ? v : null;
}

export type LiveAlertmanagerStatus = { connected: boolean; url: string | null };

/** Whether Prometheus currently has a live Alertmanager target (→ Slack receiver). */
export async function getLiveAlertmanagerStatus(): Promise<LiveAlertmanagerStatus | null> {
  const PROMETHEUS_URL = process.env.PROMETHEUS_URL ?? "http://localhost:9090";
  try {
    const res = await fetch(new URL("/api/v1/alertmanagers", PROMETHEUS_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== "success") return null;
    const active = json.data.activeAlertmanagers as { url: string }[];
    return { connected: active.length > 0, url: active[0]?.url ?? null };
  } catch {
    return null;
  }
}
