export type ServiceStatus = "healthy" | "warning" | "critical";

export type ServiceDef = {
  id: string;
  label: string;
  category: "api" | "ai" | "consumer" | "recommendation";
  hasKafka: boolean;
  hasDb: boolean;
  baseRps: number;
  minReplicas: number;
  maxReplicas: number;
  currentReplicas: number;
  volatility: number; // 0..1, how spiky the traffic is
  incidentProfile: "none" | "capacity" | "latency" | "deploy_regression";
};

export type SeriesPoint = { t: number; v: number };

export type ServiceMelt = {
  service: ServiceDef;
  rps: SeriesPoint[];
  p95Ms: SeriesPoint[];
  errorRatio: SeriesPoint[];
  cpuPct: SeriesPoint[];
  memPct: SeriesPoint[];
  dbPoolPct: SeriesPoint[] | null;
  kafkaLag: SeriesPoint[] | null;
  restarts: number;
  status: ServiceStatus;
  anomalyScore: number;
  confidence: number;
  recentDeploymentMinutesAgo: number | null;
  topLogError: string | null;
  slowTraceOperation: string | null;
  suspectedCause: string | null;
  recommendedReplicas: number;
};

export type ServiceSummary = {
  id: string;
  label: string;
  status: ServiceStatus;
  rps: number;
  p95Ms: number;
  errorRatioPct: number;
  anomalyScore: number;
  currentReplicas: number;
  recommendedReplicas: number;
  sparkline: number[];
};

export type Incident = {
  id: string;
  service: string;
  serviceLabel: string;
  severity: "warning" | "critical";
  status: "active" | "investigating" | "resolved";
  createdAt: string;
  headline: string;
  owner: string;
  affectedUsers: number | null;
  anomalyScore: number;
  confidence: number;
  currentRps: number;
  expectedRps: number;
  p95Ms: number;
  errorRatioPct: number;
  dbPoolUsagePct: number | null;
  kafkaLag: number | null;
  recentDeployment: boolean;
  topLogError: string;
  slowTraceOperation: string;
  suspectedCause: string;
  reasons: string[];
  counterEvidence: string[];
  recommendedActions: string[];
  expectedRecoveryEffect: string;
  currentReplicas: number;
  recommendedReplicas: number;
};

export type AlertRuleCategory =
  | "사용자 영향"
  | "API"
  | "Compute"
  | "Memory"
  | "Disk"
  | "Pod"
  | "DB"
  | "Kafka"
  | "Network"
  | "Capacity"
  | "Observability";

export type AlertRule = {
  id: string;
  category: AlertRuleCategory;
  name: string;
  condition: string;
  severity: "critical" | "high" | "warning" | "info";
  enabled: boolean;
  firingNow: boolean;
};

export type NotificationPolicy = {
  id: string;
  severity: "Critical" | "High" | "Warning" | "Info";
  condition: string;
  channel: string;
  owner: string;
  resendMinutes: number | null;
};

export type KubernetesEvent = {
  id: string;
  type: "warning" | "normal";
  reason: string;
  service: string;
  message: string;
  minutesAgo: number;
};

export type BusinessEvent = {
  id: string;
  topic: string;
  service: string;
  status: "ok" | "delayed" | "failed";
  minutesAgo: number;
  detail: string;
};

export type KafkaTopicStat = {
  topic: string;
  service: string;
  produceRate: number;
  consumeRate: number;
  lag: number;
  retryRate: number;
  dlqCount: number;
};

export type DbStats = {
  activeConnections: number;
  poolSize: number;
  poolWaiting: number;
  txLatencyMs: number;
  slowQueries: number;
  locks: number;
  replicationLagMs: number;
  postgisQueryLatencyMs: number;
};

export type RedisStats = {
  hitRatioPct: number;
  memoryUsedMb: number;
  memoryMaxMb: number;
  evictionsPerMin: number;
};

export type StackComponentHealth = {
  component: "Prometheus" | "Loki" | "Tempo" | "Alloy";
  ingestionSuccessPct: number;
  droppedPerMin: number;
  walErrors: number;
  diskUsagePct: number;
  queryLatencyMs: number;
  retentionDays: number;
};

export type ScaleEvent = {
  id: string;
  type: "scale_out" | "scale_in" | "cron";
  minutesAgo: number;
  fromReplicas: number;
  toReplicas: number;
  reason: string;
};

export type ScaleTimeline = {
  service: string;
  podCapacityRps: number;
  points: { t: number; current: number; recommended: number }[];
  events: ScaleEvent[];
};

export type CapacityGuard = {
  deployablePods: number;
  pendingPods: number;
  cpuHeadroomPods: number;
  memHeadroomPods: number;
  antiAffinityOk: boolean;
  maxExpandableReplicas: number;
};

export type LogEntry = {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  errorType: string | null;
  durationMs: number | null;
};

export type TraceSpan = {
  id: string;
  operation: string;
  durationMs: number;
  status: "ok" | "error";
  spanCount: number;
};

export type NodeHealth = {
  name: string;
  status: "Ready" | "NotReady" | "Pressure";
  cpuPct: number;
  memPct: number;
  diskPct: number;
  pods: number;
  podCapacity: number;
};

export type EndpointHealth = {
  id: string;
  name: string;
  port: number;
  purpose: string;
  status: "healthy" | "degraded" | "down";
  responseMs: number;
  lastCheckSecondsAgo: number;
  consecutiveFailures: number;
};

export type ServiceDependencyEdge = {
  target: string;
  kind: "service" | "db" | "cache" | "queue";
  rps: number;
  errorRatioPct: number;
  p95Ms: number;
  lag: number | null;
  status: ServiceStatus;
};

export type ChangeEvent = {
  id: string;
  type: "deploy" | "config" | "secret" | "network_policy" | "scale" | "alert_rule";
  service: string;
  serviceLabel: string;
  resource: string;
  summary: string;
  minutesAgo: number;
  successRatioBeforePct: number;
  successRatioAfterPct: number;
  p95BeforeMs: number;
  p95AfterMs: number;
  errorBeforePct: number;
  errorAfterPct: number;
  relatedIncidentId: string | null;
  rollbackable: boolean;
};

export type MeshLinkStat = {
  id: string;
  source: string;
  sourceLabel: string;
  target: string;
  kind: "service" | "db" | "cache" | "queue";
  mtlsEnabled: boolean;
  connectionsOpenedPerMin: number;
  connectionsClosedPerMin: number;
  bytesSentPerSec: number;
  bytesReceivedPerSec: number;
  l4ErrorRatioPct: number;
};

export type JenkinsStats = {
  queuedJobs: number;
  runningJobs: number;
  executorsUsed: number;
  executorsTotal: number;
  successRatePct24h: number;
  avgBuildDurationSec: number;
  failedBuilds: { job: string; buildNumber: number; minutesAgo: number; reason: string }[];
};

export type HarborStats = {
  pushRatePerHour: number;
  pullRatePerHour: number;
  storageUsedGb: number;
  storageMaxGb: number;
  vulnerabilityCriticalCount: number;
  vulnerabilityHighCount: number;
  replicationOk: boolean;
  replicationLagMinutes: number;
  registryResponseMs: number;
};

export type BackupStatus = {
  id: string;
  system: string;
  lastBackupMinutesAgo: number;
  sizeGb: number;
  status: "ok" | "delayed" | "failed";
  retentionDays: number;
  expectedIntervalMinutes: number;
};

export type StorageStats = {
  pvUsedPct: number;
  pvcCount: number;
  longhornHealthyReplicas: number;
  longhornTotalReplicas: number;
  walGrowthMbPerMin: number;
  backupAgeMinutes: number;
};

export type PredictionHorizon = {
  service: string;
  points: { minute: number; actualRps: number | null; predictedRps: number }[];
  currentReplicas: number;
  recommendedReplicas: number;
  maeRps: number;
  mapePct: number;
  nextScaleEtaMinutes: number | null;
  modelVersion: string;
};
