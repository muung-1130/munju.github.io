import { promInstantQuery, promRangeQuery } from "./prometheus";

/**
 * Maps DAI RUN dashboard service ids to the real container `name` label
 * cAdvisor reports for the docker-compose stack actually running on this
 * machine (services-msa/docker-compose.yml). Two dashboard services
 * (Community Feed, Payment Gateway) have no real counterpart yet and stay
 * simulated.
 */
export const LIVE_CONTAINER_MAP: Record<string, string> = {
  "dir-marathon": "dai-run-marathon-service",
  "dir-running-record": "dai-run-running-record-service",
  "dir-ai-assistant": "dai-run-ai-assistant-service",
  "dir-course-recommendation-ai": "dai-run-course-recommendation-service",
  "dir-crew": "dai-run-crew-service",
  "dir-notification": "dai-run-notification-service",
};

/** Infra containers (not app services) that cAdvisor also reports on. */
export const LIVE_INFRA_CONTAINER_MAP = {
  postgres: "my-postgres",
  redis: "demo-redis",
  kafka: "dai-run-kafka-broker",
} as const;

export type LiveContainerResource = {
  containerName: string;
  cpuCores: number;
  memoryMb: number;
  series: { t: number; cpuCores: number; memoryMb: number }[];
};

function toSeries(range: { t: number; cpuCores: number | null; memoryMb: number | null }[]) {
  return range.filter((p): p is { t: number; cpuCores: number; memoryMb: number } => p.cpuCores !== null && p.memoryMb !== null);
}

export async function getLiveContainerResource(serviceId: string): Promise<LiveContainerResource | null> {
  const containerName = LIVE_CONTAINER_MAP[serviceId];
  if (!containerName) return null;
  return getLiveContainerResourceByName(containerName);
}

export async function getLiveContainerResourceByName(containerName: string): Promise<LiveContainerResource | null> {
  const [cpuNow, memNow, cpuRange, memRange] = await Promise.all([
    promInstantQuery(`rate(container_cpu_usage_seconds_total{name="${containerName}"}[2m])`),
    promInstantQuery(`container_memory_usage_bytes{name="${containerName}"}`),
    promRangeQuery(`rate(container_cpu_usage_seconds_total{name="${containerName}"}[2m])`, 30, 60),
    promRangeQuery(`container_memory_usage_bytes{name="${containerName}"}`, 30, 60),
  ]);

  if (!cpuNow?.length || !memNow?.length) return null;

  const cpuValues = cpuRange?.[0]?.values ?? [];
  const memValues = memRange?.[0]?.values ?? [];
  const memByTime = new Map(memValues.map(([t, v]) => [Math.round(t), v]));

  const rawSeries = cpuValues.map(([t, cpuV]) => {
    const memV = memByTime.get(Math.round(t));
    return {
      t,
      cpuCores: Number.isFinite(parseFloat(cpuV)) ? Math.round(parseFloat(cpuV) * 1000) / 1000 : null,
      memoryMb: memV ? Math.round((parseFloat(memV) / 1024 / 1024) * 10) / 10 : null,
    };
  });

  const series = toSeries(rawSeries).map((p, i, arr) => ({
    t: i - arr.length + 1, // minutes relative to now, matches the mock chart convention
    cpuCores: p.cpuCores,
    memoryMb: p.memoryMb,
  }));

  return {
    containerName,
    cpuCores: Math.round(parseFloat(cpuNow[0].value[1]) * 1000) / 1000,
    memoryMb: Math.round((parseFloat(memNow[0].value[1]) / 1024 / 1024) * 10) / 10,
    series,
  };
}

export type LiveHostStats = {
  hostname: string;
  cpuCores: number;
  cpuUsagePct: number;
  memTotalGb: number;
  memAvailableGb: number;
  memUsedPct: number;
  diskTotalGb: number;
  diskAvailGb: number;
  diskUsedPct: number;
  load1: number;
};

/**
 * `job` pins each query to one node-exporter target. Now that Prometheus scrapes
 * two node-exporters (this dev container's own, and the real on-prem control-plane
 * node at REAL_SERVER_NODE_EXPORTER_TARGET), every query here must be scoped —
 * otherwise a bare `node_load1` would match both and `result[0]` picks arbitrarily.
 */
async function fetchHostStatsForJob(job: string): Promise<LiveHostStats | null> {
  const sel = `{job="${job}"}`;
  const selIdle = `{job="${job}", mode="idle"}`;
  const selRoot = `{job="${job}", mountpoint="/"}`;

  const [cpuPct, memTotal, memAvail, diskTotal, diskAvail, cpuCores, load1, uname] = await Promise.all([
    promInstantQuery(`100 - (avg(rate(node_cpu_seconds_total${selIdle}[2m])) * 100)`),
    promInstantQuery(`node_memory_MemTotal_bytes${sel}`),
    promInstantQuery(`node_memory_MemAvailable_bytes${sel}`),
    promInstantQuery(`node_filesystem_size_bytes${selRoot}`),
    promInstantQuery(`node_filesystem_avail_bytes${selRoot}`),
    promInstantQuery(`count(node_cpu_seconds_total${selIdle})`),
    promInstantQuery(`node_load1${sel}`),
    promInstantQuery(`node_uname_info${sel}`),
  ]);

  if (!cpuPct?.length || !memTotal?.length || !memAvail?.length) return null;

  const memTotalBytes = parseFloat(memTotal[0].value[1]);
  const memAvailBytes = parseFloat(memAvail[0].value[1]);
  const diskTotalBytes = diskTotal?.[0] ? parseFloat(diskTotal[0].value[1]) : 0;
  const diskAvailBytes = diskAvail?.[0] ? parseFloat(diskAvail[0].value[1]) : 0;

  const gb = (bytes: number) => Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10;

  return {
    hostname: uname?.[0]?.metric.nodename ?? "unknown",
    cpuCores: cpuCores?.[0] ? parseInt(cpuCores[0].value[1], 10) : 0,
    cpuUsagePct: Math.round(parseFloat(cpuPct[0].value[1]) * 10) / 10,
    memTotalGb: gb(memTotalBytes),
    memAvailableGb: gb(memAvailBytes),
    memUsedPct: Math.round((1 - memAvailBytes / memTotalBytes) * 1000) / 10,
    diskTotalGb: gb(diskTotalBytes),
    diskAvailGb: gb(diskAvailBytes),
    diskUsedPct: diskTotalBytes ? Math.round((1 - diskAvailBytes / diskTotalBytes) * 1000) / 10 : 0,
    load1: load1?.[0] ? Math.round(parseFloat(load1[0].value[1]) * 100) / 100 : 0,
  };
}

/** This dev container's own host (job: node-exporter). */
export async function getLiveHostStats(): Promise<LiveHostStats | null> {
  return fetchHostStatsForJob("node-exporter");
}

/**
 * The real on-prem Kubernetes control-plane node (dir-master1, 192.168.0.200).
 * Job name is configurable via REAL_SERVER_NODE_EXPORTER_JOB so this keeps working
 * unchanged if the scrape job is renamed when this moves onto the real cluster's
 * own Prometheus instead of being scraped remotely by the dev one.
 */
export async function getRealServerHostStats(): Promise<LiveHostStats | null> {
  const job = process.env.REAL_SERVER_NODE_EXPORTER_JOB ?? "dir-master1-node-exporter";
  return fetchHostStatsForJob(job);
}

export type LiveVulnerabilitySummary = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  scannedImages: number;
} | null;

/**
 * CI pushes Trivy scan results to Pushgateway (job: pushgateway, honor_labels: true
 * so the image/severity labels survive). Returns null both when unreachable AND
 * when reachable-but-empty (no scan has been pushed yet) — callers should treat
 * both the same way: nothing to show, not a fabricated zero.
 */
export async function getLiveVulnerabilitySummary(): Promise<LiveVulnerabilitySummary> {
  const bySeverity = await promInstantQuery(`sum by (severity) (trivy_image_vulnerabilities{job="pushgateway"})`);
  if (!bySeverity || bySeverity.length === 0) return null;

  const images = await promInstantQuery(`count(count by (image_name) (trivy_image_vulnerabilities{job="pushgateway"}))`);

  const bucket = (severity: string) =>
    bySeverity
      .filter((r) => r.metric.severity?.toUpperCase() === severity)
      .reduce((sum, r) => sum + parseFloat(r.value[1]), 0);

  return {
    critical: bucket("CRITICAL"),
    high: bucket("HIGH"),
    medium: bucket("MEDIUM"),
    low: bucket("LOW"),
    scannedImages: images?.[0] ? parseInt(images[0].value[1], 10) : 0,
  };
}
