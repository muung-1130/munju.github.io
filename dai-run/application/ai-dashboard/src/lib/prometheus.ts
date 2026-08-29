/**
 * Minimal server-only client for a real, running Prometheus instance.
 * Every call is best-effort: on any failure (network, timeout, bad response)
 * these return `null` so callers can fall back to the simulated data rather
 * than crash the page or silently show fake numbers as if they were live.
 */

const PROMETHEUS_URL = process.env.PROMETHEUS_URL ?? "http://localhost:9090";
const FETCH_TIMEOUT_MS = 2500;

export type PromInstantSample = { metric: Record<string, string>; value: [number, string] };
export type PromRangeSample = { metric: Record<string, string>; values: [number, string][] };

async function promFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(path, PROMETHEUS_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== "success") return null;
    return json.data as T;
  } catch {
    return null;
  }
}

export async function promInstantQuery(query: string): Promise<PromInstantSample[] | null> {
  const data = await promFetch<{ result: PromInstantSample[] }>("/api/v1/query", { query });
  return data?.result ?? null;
}

export async function promRangeQuery(
  query: string,
  minutes: number,
  stepSeconds = 60,
): Promise<PromRangeSample[] | null> {
  const end = Math.floor(Date.now() / 1000);
  const start = end - minutes * 60;
  const data = await promFetch<{ result: PromRangeSample[] }>("/api/v1/query_range", {
    query,
    start: String(start),
    end: String(end),
    step: String(stepSeconds),
  });
  return data?.result ?? null;
}

export async function promIsHealthy(): Promise<boolean> {
  try {
    const res = await fetch(new URL("/-/healthy", PROMETHEUS_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
