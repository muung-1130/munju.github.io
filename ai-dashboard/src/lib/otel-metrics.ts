import { promInstantQuery, promRangeQuery } from "./prometheus";

/**
 * Real RED metrics (Rate, Errors, Duration) for services instrumented with the
 * OpenTelemetry Node.js SDK, exported as `http_server_duration_milliseconds_*`
 * and scraped into Prometheus by Alloy's OTLP receiver. The `job` label equals
 * the container name (see live.ts LIVE_CONTAINER_MAP), so this shares the same
 * service identity as the cAdvisor-based CPU/Memory panels.
 *
 * Traffic in this dev environment is sparse (mostly health checks), so a wide
 * rate window (1h) is used to get a stable, non-zero signal — a real service
 * under real load would use the usual 2-5m window instead.
 */

const RATE_WINDOW = process.env.OTEL_RATE_WINDOW ?? "1h";

export type LiveServiceRed = {
  containerJob: string;
  rpsNow: number;
  errorRatioPctNow: number;
  p95Ms: number | null;
  totalRequestsInWindow: number;
  series: { t: number; rps: number; errorRatioPct: number; p95Ms: number | null }[];
};

function safeNumber(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export async function getLiveServiceRed(containerJob: string): Promise<LiveServiceRed | null> {
  const metricSel = `{job="${containerJob}"}`;
  const errSel = `{job="${containerJob}", http_status_code=~"5.."}`;

  const [present, rpsNow, errNow, p95Now, rpsRange, errRange, p95Range] = await Promise.all([
    promInstantQuery(`count(http_server_duration_milliseconds_count${metricSel})`),
    promInstantQuery(`sum(rate(http_server_duration_milliseconds_count${metricSel}[${RATE_WINDOW}]))`),
    promInstantQuery(
      `100 * sum(rate(http_server_duration_milliseconds_count${errSel}[${RATE_WINDOW}])) / sum(rate(http_server_duration_milliseconds_count${metricSel}[${RATE_WINDOW}]))`,
    ),
    promInstantQuery(`histogram_quantile(0.95, sum by (le) (rate(http_server_duration_milliseconds_bucket${metricSel}[${RATE_WINDOW}])))`),
    promRangeQuery(`sum(rate(http_server_duration_milliseconds_count${metricSel}[${RATE_WINDOW}]))`, 60, 300),
    promRangeQuery(
      `100 * sum(rate(http_server_duration_milliseconds_count${errSel}[${RATE_WINDOW}])) / sum(rate(http_server_duration_milliseconds_count${metricSel}[${RATE_WINDOW}]))`,
      60,
      300,
    ),
    promRangeQuery(`histogram_quantile(0.95, sum by (le) (rate(http_server_duration_milliseconds_bucket${metricSel}[${RATE_WINDOW}])))`, 60, 300),
  ]);

  // No presence at all means this service isn't OTel-instrumented (or never received a request) —
  // distinct from "instrumented but currently 0 rps", which still returns a present series.
  if (!present?.length || parseInt(present[0].value[1], 10) === 0) return null;

  const rpsValues = rpsRange?.[0]?.values ?? [];
  const errByTime = new Map((errRange?.[0]?.values ?? []).map(([t, v]) => [Math.round(t), v]));
  const p95ByTime = new Map((p95Range?.[0]?.values ?? []).map(([t, v]) => [Math.round(t), v]));

  const stepMinutes = 5; // promRangeQuery(..., 60, 300) below: 300s step
  const series = rpsValues.map(([t, rpsV], i, arr) => ({
    t: (i - arr.length + 1) * stepMinutes,
    rps: Math.round((safeNumber(rpsV) ?? 0) * 1000) / 1000,
    errorRatioPct: Math.round((safeNumber(errByTime.get(Math.round(t))) ?? 0) * 100) / 100,
    p95Ms: (() => {
      const v = safeNumber(p95ByTime.get(Math.round(t)));
      return v === null ? null : Math.round(v * 10) / 10;
    })(),
  }));

  return {
    containerJob,
    rpsNow: Math.round((safeNumber(rpsNow?.[0]?.value[1]) ?? 0) * 1000) / 1000,
    errorRatioPctNow: Math.round((safeNumber(errNow?.[0]?.value[1]) ?? 0) * 100) / 100,
    p95Ms: (() => {
      const v = safeNumber(p95Now?.[0]?.value[1]);
      return v === null ? null : Math.round(v * 10) / 10;
    })(),
    totalRequestsInWindow: parseInt(present[0].value[1], 10),
    series,
  };
}
