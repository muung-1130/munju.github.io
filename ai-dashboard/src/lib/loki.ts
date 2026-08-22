const LOKI_URL = process.env.LOKI_URL ?? "http://localhost:3100";
const FETCH_TIMEOUT_MS = 3000;

export type LiveLogEntry = {
  id: string;
  timestampNs: string;
  line: string;
  level: "INFO" | "WARN" | "ERROR" | "UNKNOWN";
  stream: string;
};

function guessLevel(line: string): LiveLogEntry["level"] {
  const upper = line.toUpperCase();
  if (upper.includes("ERROR") || upper.includes('"LEVEL":50') || upper.includes('"LEVEL":"ERROR"')) return "ERROR";
  if (upper.includes("WARN")) return "WARN";
  if (upper.includes("INFO")) return "INFO";
  return "UNKNOWN";
}

/**
 * Real container log lines for `containerName`, most recent first. Looks back
 * `lookbackHours` (default 7 days — these services mostly only log at process
 * startup, not per-request, so even an active service can have zero lines in
 * a short recent window despite being perfectly healthy).
 */
export async function getLiveLogs(containerName: string, limit = 15, lookbackHours = 24 * 7): Promise<LiveLogEntry[] | null> {
  const end = Date.now() * 1_000_000; // ns
  const start = end - lookbackHours * 3600 * 1_000_000_000;

  const url = new URL("/loki/api/v1/query_range", LOKI_URL);
  url.searchParams.set("query", `{container="${containerName}"}`);
  url.searchParams.set("start", String(start));
  url.searchParams.set("end", String(end));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("direction", "backward");

  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== "success") return null;

    const streams: { stream: Record<string, string>; values: [string, string][] }[] = json.data.result;
    const entries: LiveLogEntry[] = [];
    for (const s of streams) {
      for (const [ts, line] of s.values) {
        entries.push({
          id: `${ts}-${entries.length}`,
          timestampNs: ts,
          line,
          level: guessLevel(line),
          stream: s.stream.stream ?? "stdout",
        });
      }
    }
    entries.sort((a, b) => (a.timestampNs < b.timestampNs ? 1 : -1));
    return entries.slice(0, limit);
  } catch {
    return null;
  }
}

export type ClusterLogEntry = {
  id: string;
  timestampNs: string;
  namespace: string;
  container: string;
  line: string;
  level: LiveLogEntry["level"];
};

/**
 * Recent warn/error-level lines across every dai-run app namespace, for the
 * cluster-wide AI insights page. Uses the real EKS Loki's own label schema
 * (k8s_namespace_name / k8s_container_name, set by the ADOT collector's
 * k8sattributes processor) — NOT the `container` label getLiveLogs() above
 * uses, which only matches the old docker-compose dev stack's container
 * names and returns nothing against this cluster's Loki.
 */
export async function getLiveClusterLogSample(limit = 60, lookbackHours = 6): Promise<ClusterLogEntry[] | null> {
  const end = Date.now() * 1_000_000; // ns
  const start = end - lookbackHours * 3600 * 1_000_000_000;

  const url = new URL("/loki/api/v1/query_range", LOKI_URL);
  url.searchParams.set("query", '{k8s_namespace_name=~"dir-.*"} |~ `(?i)error|exception|panic|fail|timeout|refused`');
  url.searchParams.set("start", String(start));
  url.searchParams.set("end", String(end));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("direction", "backward");

  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== "success") return null;

    const streams: { stream: Record<string, string>; values: [string, string][] }[] = json.data.result;
    const entries: ClusterLogEntry[] = [];
    for (const s of streams) {
      const namespace = s.stream.k8s_namespace_name ?? "?";
      const container = s.stream.k8s_container_name ?? "?";
      for (const [ts, line] of s.values) {
        entries.push({
          id: `${ts}-${entries.length}`,
          timestampNs: ts,
          namespace,
          container,
          line,
          level: guessLevel(line),
        });
      }
    }
    entries.sort((a, b) => (a.timestampNs < b.timestampNs ? 1 : -1));
    return entries.slice(0, limit);
  } catch {
    return null;
  }
}
