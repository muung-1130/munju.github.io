const TEMPO_URL = process.env.TEMPO_URL ?? "http://localhost:3200";
const FETCH_TIMEOUT_MS = 3000;

export type LiveTrace = {
  traceId: string;
  rootServiceName: string;
  rootTraceName: string;
  durationMs: number;
  startTimeUnixNano: string;
  /** Minutes between fetch time and trace start — computed here (a plain data
   *  function), not in a component render, since components must stay pure. */
  minutesAgo: number;
};

/** Real traces for `serviceName` via Tempo's TraceQL search, most recent first. */
export async function getLiveTraces(serviceName: string, limit = 10): Promise<LiveTrace[] | null> {
  const url = new URL("/api/search", TEMPO_URL);
  url.searchParams.set("q", `{resource.service.name="${serviceName}"}`);
  url.searchParams.set("limit", String(limit));

  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = await res.json();
    const traces: Array<{ traceID: string; rootServiceName?: string; rootTraceName?: string; durationMs?: number; startTimeUnixNano: string }> =
      json.traces ?? [];
    const fetchedAtMs = Date.now();

    return traces
      .map((t) => ({
        traceId: t.traceID,
        rootServiceName: t.rootServiceName ?? serviceName,
        rootTraceName: t.rootTraceName ?? "(unnamed span)",
        durationMs: t.durationMs ?? 0,
        startTimeUnixNano: t.startTimeUnixNano,
        minutesAgo: Math.max(0, Math.round((fetchedAtMs - parseInt(t.startTimeUnixNano, 10) / 1_000_000) / 60000)),
      }))
      .sort((a, b) => (a.startTimeUnixNano < b.startTimeUnixNano ? 1 : -1));
  } catch {
    return null;
  }
}
