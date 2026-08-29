import type {
  AlertRule,
  BackupStatus,
  BusinessEvent,
  CapacityGuard,
  ChangeEvent,
  DbStats,
  EndpointHealth,
  HarborStats,
  Incident,
  JenkinsStats,
  KafkaTopicStat,
  KubernetesEvent,
  MeshLinkStat,
  NodeHealth,
  NotificationPolicy,
  PredictionHorizon,
  RedisStats,
  ServiceDef,
  ServiceDependencyEdge,
  ServiceMelt,
  ServiceStatus,
  ServiceSummary,
  StackComponentHealth,
  StorageStats,
} from "./types";

/**
 * Deterministic mock telemetry for the DAI RUN AI observability dashboard.
 * Everything here is a pure function of a fixed anchor time + string seeds,
 * so server render and client hydration always agree without shipping a
 * live backend.
 */

export const NOW = new Date("2026-08-02T14:00:00+09:00").getTime();
export const WINDOW_MINUTES = 60;

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor(seed: string) {
  return mulberry32(hashSeed(seed));
}

export const SERVICES: ServiceDef[] = [
  {
    id: "dir-marathon",
    label: "Marathon Service",
    category: "api",
    hasKafka: true,
    hasDb: true,
    baseRps: 42,
    minReplicas: 2,
    maxReplicas: 8,
    currentReplicas: 4,
    volatility: 0.55,
    incidentProfile: "capacity",
  },
  {
    id: "dir-running-record",
    label: "Running Record Service",
    category: "api",
    hasKafka: true,
    hasDb: true,
    baseRps: 65,
    minReplicas: 3,
    maxReplicas: 10,
    currentReplicas: 5,
    volatility: 0.3,
    incidentProfile: "none",
  },
  {
    id: "dir-ai-assistant",
    label: "AI Assistant",
    category: "ai",
    hasKafka: false,
    hasDb: true,
    baseRps: 18,
    minReplicas: 2,
    maxReplicas: 6,
    currentReplicas: 3,
    volatility: 0.5,
    incidentProfile: "latency",
  },
  {
    id: "dir-course-recommendation-ai",
    label: "Course Recommendation AI",
    category: "recommendation",
    hasKafka: false,
    hasDb: true,
    baseRps: 24,
    minReplicas: 2,
    maxReplicas: 6,
    currentReplicas: 2,
    volatility: 0.25,
    incidentProfile: "none",
  },
  {
    id: "dir-crew",
    label: "Crew Service",
    category: "api",
    hasKafka: true,
    hasDb: true,
    baseRps: 31,
    minReplicas: 2,
    maxReplicas: 6,
    currentReplicas: 2,
    volatility: 0.35,
    incidentProfile: "deploy_regression",
  },
  {
    id: "dir-notification",
    label: "Notification Consumer",
    category: "consumer",
    hasKafka: true,
    hasDb: false,
    baseRps: 20,
    minReplicas: 2,
    maxReplicas: 5,
    currentReplicas: 2,
    volatility: 0.2,
    incidentProfile: "none",
  },
  {
    id: "dir-community",
    label: "Community Feed",
    category: "api",
    hasKafka: false,
    hasDb: true,
    baseRps: 38,
    minReplicas: 2,
    maxReplicas: 6,
    currentReplicas: 3,
    volatility: 0.2,
    incidentProfile: "none",
  },
  {
    id: "dir-payment",
    label: "Payment Gateway",
    category: "api",
    hasKafka: true,
    hasDb: true,
    baseRps: 12,
    minReplicas: 2,
    maxReplicas: 4,
    currentReplicas: 2,
    volatility: 0.15,
    incidentProfile: "none",
  },
];

export const SERVICE_MAP = new Map(SERVICES.map((s) => [s.id, s]));

function diurnalFactor(minuteOfDay: number) {
  // peaks ~08:00 and ~20:00, trough overnight — roughly matches run-club traffic
  const hour = (minuteOfDay / 60) % 24;
  const morning = Math.exp(-((hour - 8) ** 2) / 8);
  const evening = Math.exp(-((hour - 20) ** 2) / 10);
  return 0.35 + 0.65 * Math.max(morning, evening);
}

function genSeries(
  seed: string,
  base: number,
  volatility: number,
  opts: { spikeAt?: number; spikeMagnitude?: number; trendUp?: boolean } = {},
): { t: number; v: number }[] {
  const rand = rngFor(seed);
  const points: { t: number; v: number }[] = [];
  let level = base;
  for (let i = 0; i <= WINDOW_MINUTES; i++) {
    const t = i - WINDOW_MINUTES; // minutes relative to now, negative = past
    const absoluteMinute = (NOW / 60000 + t) % 1440;
    const diurnal = diurnalFactor(absoluteMinute);
    const noise = (rand() - 0.5) * volatility * base * 0.4;
    let target = base * diurnal + noise;

    if (opts.trendUp) {
      target += ((i / WINDOW_MINUTES) * base) / 2;
    }
    if (opts.spikeAt !== undefined && i >= opts.spikeAt) {
      const progress = (i - opts.spikeAt) / Math.max(1, WINDOW_MINUTES - opts.spikeAt);
      target += base * (opts.spikeMagnitude ?? 1) * Math.min(1, progress * 1.6);
    }

    level = level * 0.35 + target * 0.65;
    points.push({ t, v: Math.max(0, Math.round(level * 10) / 10) });
  }
  return points;
}

const meltCache = new Map<string, ServiceMelt>();

export function buildServiceMelt(serviceId: string): ServiceMelt {
  const cached = meltCache.get(serviceId);
  if (cached) return cached;

  const service = SERVICE_MAP.get(serviceId);
  if (!service) throw new Error(`unknown service: ${serviceId}`);

  const profile = service.incidentProfile;
  const rpsSpike = profile === "capacity" ? { spikeAt: 40, spikeMagnitude: 1.3 } : {};
  const rps = genSeries(`${serviceId}:rps`, service.baseRps, service.volatility, rpsSpike);

  const basP95 = 180 + service.volatility * 120;
  const p95Ms = genSeries(`${serviceId}:p95`, basP95, service.volatility, {
    spikeAt: profile === "capacity" ? 40 : profile === "latency" ? 35 : undefined,
    spikeMagnitude: profile === "capacity" ? 12 : profile === "latency" ? 6 : undefined,
  });

  const baseError = profile === "deploy_regression" ? 1.2 : 0.6;
  const errorRatio = genSeries(`${serviceId}:err`, baseError, 0.8, {
    spikeAt: profile === "deploy_regression" ? 45 : undefined,
    spikeMagnitude: profile === "deploy_regression" ? 9 : undefined,
  }).map((p) => ({ t: p.t, v: Math.min(35, p.v) }));

  const cpuPct = genSeries(`${serviceId}:cpu`, 38 + service.volatility * 20, 0.4, {
    spikeAt: profile !== "none" ? 42 : undefined,
    spikeMagnitude: profile !== "none" ? 1.1 : undefined,
  }).map((p) => ({ t: p.t, v: Math.min(98, p.v) }));

  const memPct = genSeries(`${serviceId}:mem`, 45 + service.volatility * 15, 0.2).map((p) => ({
    t: p.t,
    v: Math.min(92, p.v),
  }));

  const dbPoolPct = service.hasDb
    ? genSeries(`${serviceId}:dbpool`, profile === "capacity" ? 55 : 40, 0.35, {
        spikeAt: profile === "capacity" ? 40 : undefined,
        spikeMagnitude: profile === "capacity" ? 1.6 : undefined,
      }).map((p) => ({ t: p.t, v: Math.min(99, p.v) }))
    : null;

  const kafkaLag = service.hasKafka
    ? genSeries(`${serviceId}:lag`, 8 + service.volatility * 20, 0.6, {
        spikeAt: profile === "capacity" ? 40 : undefined,
        spikeMagnitude: profile === "capacity" ? 4 : undefined,
      }).map((p) => ({ t: p.t, v: Math.max(0, Math.round(p.v)) }))
    : null;

  const last = <T extends { v: number }>(arr: T[]) => arr[arr.length - 1].v;
  const rand = rngFor(`${serviceId}:meta`);

  const errNow = last(errorRatio);
  const dbNow = dbPoolPct ? last(dbPoolPct) : 0;

  let anomalyScore = 0.08 + rand() * 0.1;
  if (profile === "capacity") anomalyScore = 0.82 + rand() * 0.14;
  if (profile === "latency") anomalyScore = 0.68 + rand() * 0.16;
  if (profile === "deploy_regression") anomalyScore = 0.74 + rand() * 0.18;
  anomalyScore = Math.min(0.99, anomalyScore);

  let status: ServiceStatus = "healthy";
  if (anomalyScore >= 0.85 || errNow > 5 || dbNow > 90) status = "critical";
  else if (anomalyScore >= 0.5 || errNow > 2 || dbNow > 75) status = "warning";

  const recentDeploymentMinutesAgo =
    profile === "deploy_regression" ? 4 + Math.floor(rand() * 4) : profile === "capacity" ? null : rand() > 0.7 ? 40 + Math.floor(rand() * 90) : null;

  const causeByProfile: Record<string, { cause: string; log: string; trace: string }> = {
    capacity: {
      cause: "DB_CONNECTION_POOL_EXHAUSTION",
      log: "Connection acquisition timeout",
      trace: `POST /api/${serviceId.replace("dir-", "")}/{raceId}/apply`,
    },
    latency: {
      cause: "LLM_INFERENCE_LATENCY_SPIKE",
      log: "Upstream model timeout after 8000ms",
      trace: `POST /api/${serviceId.replace("dir-", "")}/chat`,
    },
    deploy_regression: {
      cause: "POST_DEPLOY_ERROR_RATE_REGRESSION",
      log: "NullPointerException in RequestValidator",
      trace: `POST /api/${serviceId.replace("dir-", "")}/join-request`,
    },
    none: { cause: "", log: "", trace: "" },
  };
  const c = causeByProfile[profile];

  const recommendedReplicas =
    profile === "capacity"
      ? Math.min(service.maxReplicas, service.currentReplicas + 2 + Math.round(rand()))
      : profile === "none"
        ? service.currentReplicas
        : Math.min(service.maxReplicas, service.currentReplicas + 1);

  const melt: ServiceMelt = {
    service,
    rps,
    p95Ms,
    errorRatio,
    cpuPct,
    memPct,
    dbPoolPct,
    kafkaLag,
    restarts: profile === "deploy_regression" ? 2 : 0,
    status,
    anomalyScore: Math.round(anomalyScore * 100) / 100,
    confidence: Math.round((0.72 + rand() * 0.2) * 100) / 100,
    recentDeploymentMinutesAgo,
    topLogError: profile !== "none" ? c.log : null,
    slowTraceOperation: profile !== "none" ? c.trace : null,
    suspectedCause: profile !== "none" ? c.cause : null,
    recommendedReplicas,
  };

  meltCache.set(serviceId, melt);
  return melt;
}

export function getAllMelt(): ServiceMelt[] {
  return SERVICES.map((s) => buildServiceMelt(s.id));
}

export function getServiceSummaries(): ServiceSummary[] {
  return getAllMelt().map((m) => ({
    id: m.service.id,
    label: m.service.label,
    status: m.status,
    rps: m.rps[m.rps.length - 1].v,
    p95Ms: m.p95Ms[m.p95Ms.length - 1].v,
    errorRatioPct: m.errorRatio[m.errorRatio.length - 1].v,
    anomalyScore: m.anomalyScore,
    currentReplicas: m.service.currentReplicas,
    recommendedReplicas: m.recommendedReplicas,
    sparkline: m.rps.slice(-20).map((p) => p.v),
  }));
}

export function getOverview() {
  const all = getAllMelt();
  const totalRps = all.reduce((sum, m) => sum + m.rps[m.rps.length - 1].v, 0);
  const avgP95 = all.reduce((sum, m) => sum + m.p95Ms[m.p95Ms.length - 1].v, 0) / all.length;
  const avgError = all.reduce((sum, m) => sum + m.errorRatio[m.errorRatio.length - 1].v, 0) / all.length;
  const failedRequests = Math.round(
    all.reduce((sum, m) => sum + (m.rps[m.rps.length - 1].v * m.errorRatio[m.errorRatio.length - 1].v) / 100, 0) * 60,
  );

  const healthy = all.filter((m) => m.status === "healthy").length;
  const warning = all.filter((m) => m.status === "warning").length;
  const critical = all.filter((m) => m.status === "critical").length;

  const predicted10m = totalRps * 1.18;

  const clusterCpuPct = 58;
  const clusterMemPct = 64;
  const podsAvailable = 34;
  const podsUsed = 24;

  return {
    totalServices: all.length,
    healthy,
    warning,
    critical,
    totalRps: Math.round(totalRps),
    avgP95: Math.round(avgP95),
    avgErrorPct: Math.round(avgError * 100) / 100,
    failedRequestsLastHour: failedRequests,
    predicted10m: Math.round(predicted10m),
    clusterCpuPct,
    clusterMemPct,
    podsAvailable,
    podsUsed,
    rpsSeries: sumSeries(all.map((m) => m.rps)),
  };
}

function sumSeries(all: { t: number; v: number }[][]) {
  const length = all[0].length;
  const out: { t: number; v: number }[] = [];
  for (let i = 0; i < length; i++) {
    out.push({ t: all[0][i].t, v: Math.round(all.reduce((sum, s) => sum + s[i].v, 0)) });
  }
  return out;
}

const OWNER_BY_CATEGORY: Record<ServiceDef["category"], string> = {
  api: "Backend Platform팀",
  ai: "AI Platform팀",
  consumer: "Messaging Platform팀",
  recommendation: "AI Platform팀",
};

export function getIncidents(): Incident[] {
  const all = getAllMelt().filter((m) => m.service.incidentProfile !== "none");
  return all.map((m, idx) => {
    const rand = rngFor(`${m.service.id}:incident-narrative`);
    const rpsNow = m.rps[m.rps.length - 1].v;
    const expected = m.rps[m.rps.length - 20].v;
    const p95Before = Math.round(m.p95Ms[m.p95Ms.length - 20].v);
    const p95Now = Math.round(m.p95Ms[m.p95Ms.length - 1].v);
    const reasons: string[] = [];
    const counterEvidence: string[] = [];
    const actions: string[] = [];
    let headline = "";
    let expectedRecoveryEffect = "";

    if (m.service.incidentProfile === "capacity") {
      reasons.push(
        `요청량이 40분 전 대비 ${(rpsNow / Math.max(1, expected)).toFixed(1)}배 증가했습니다.`,
        `DB Pool 사용률이 ${Math.round(m.dbPoolPct![m.dbPoolPct!.length - 1].v)}%입니다.`,
        `p95가 ${p95Before}ms에서 ${p95Now}ms로 상승했습니다.`,
        `가장 많은 오류는 ${m.topLogError}입니다.`,
      );
      counterEvidence.push("동일 시간대 다른 서비스에서도 트래픽 증가가 관측되어 계절성(이벤트성 유입)일 가능성도 있습니다.");
      actions.push(
        `${m.service.label} Pod를 ${m.service.currentReplicas}개에서 ${m.recommendedReplicas}개로 확장`,
        "Pod당 DB Pool 최댓값 점검",
        "전체 DB Connection 상한 초과 여부 확인",
      );
      headline = `${m.service.label} p95가 ${p95Before}ms에서 ${p95Now}ms로 증가했습니다. DB connection pool 포화와 요청량 급증이 동시에 감지되었습니다. 최근 배포와의 상관관계는 낮으며, capacity saturation이 1순위 원인입니다.`;
      expectedRecoveryEffect = `Pod를 ${m.recommendedReplicas}개로 확장하면 DB Pool 대기가 해소되며 p95가 SLO(800ms) 이내로 복귀할 것으로 예상됩니다.`;
    } else if (m.service.incidentProfile === "latency") {
      reasons.push(
        `p95 지연시간이 ${p95Now}ms로 상승했습니다.`,
        `가장 느린 구간은 ${m.slowTraceOperation}입니다.`,
        `이상 점수가 ${(m.anomalyScore * 100).toFixed(0)}점입니다.`,
      );
      counterEvidence.push("동일 모델을 사용하는 다른 서비스에서는 지연 증가가 관측되지 않아 이 서비스 고유 요인일 수 있습니다.");
      actions.push("LLM Provider 응답시간 확인", "Tool Calling 단계 타임아웃 조정 검토", "요청 큐잉/재시도 정책 점검");
      headline = `${m.service.label} p95가 ${p95Before}ms에서 ${p95Now}ms로 증가했습니다. LLM 추론 구간 지연이 동시에 감지되었습니다. 최근 배포와의 상관관계는 낮으며, 모델 응답 지연이 1순위 원인입니다.`;
      expectedRecoveryEffect = "Provider 응답시간이 정상화되면 p95가 자동으로 회복될 것으로 예상되며, Pod 확장 효과는 제한적입니다.";
    } else {
      reasons.push(
        `배포 ${m.recentDeploymentMinutesAgo}분 후 오류율이 상승했습니다.`,
        `가장 많은 오류는 ${m.topLogError}입니다.`,
        `Pod 재시작이 ${m.restarts}회 발생했습니다.`,
      );
      counterEvidence.push("동일 배포로 함께 나간 다른 서비스는 정상이라 배포 자체보다 이 서비스 코드 경로 문제일 가능성이 높습니다.");
      actions.push("최근 배포 rollback 가능 여부 확인", "오류 fingerprint 기준 관련 로그 조회", "카나리 트래픽 비율 축소 검토");
      headline = `${m.service.label} 오류율이 ${m.errorRatio[m.errorRatio.length - 1].v.toFixed(1)}%로 상승했습니다. 최근 배포(${m.recentDeploymentMinutesAgo}분 전) 직후 발생했으며, 상관관계가 높습니다. 코드 회귀가 1순위 원인입니다.`;
      expectedRecoveryEffect = "이전 배포 버전으로 rollback하면 오류율이 즉시 정상 범위로 복귀할 것으로 예상됩니다.";
    }

    const severity: "warning" | "critical" = m.status === "critical" ? "critical" : "warning";

    return {
      id: `inc-20260802-${String(idx + 1).padStart(3, "0")}`,
      service: m.service.id,
      serviceLabel: m.service.label,
      severity,
      status: idx === 0 ? "active" : "investigating",
      createdAt: new Date(NOW - (12 + idx * 7) * 60000).toISOString(),
      headline,
      owner: OWNER_BY_CATEGORY[m.service.category],
      affectedUsers: Math.round(rpsNow * (6 + rand() * 4)),
      anomalyScore: m.anomalyScore,
      confidence: m.confidence,
      currentRps: rpsNow,
      expectedRps: Math.round(expected * 10) / 10,
      p95Ms: p95Now,
      errorRatioPct: Math.round(m.errorRatio[m.errorRatio.length - 1].v * 100) / 100,
      dbPoolUsagePct: m.dbPoolPct ? Math.round(m.dbPoolPct[m.dbPoolPct.length - 1].v) : null,
      kafkaLag: m.kafkaLag ? m.kafkaLag[m.kafkaLag.length - 1].v : null,
      recentDeployment: m.recentDeploymentMinutesAgo !== null,
      topLogError: m.topLogError ?? "",
      slowTraceOperation: m.slowTraceOperation ?? "",
      suspectedCause: m.suspectedCause ?? "",
      reasons,
      counterEvidence,
      recommendedActions: actions,
      expectedRecoveryEffect,
      currentReplicas: m.service.currentReplicas,
      recommendedReplicas: m.recommendedReplicas,
    };
  });
}

export function getKubernetesEvents(): KubernetesEvent[] {
  const rand = rngFor("k8s-events");
  const templates: { type: "warning" | "normal"; reason: string; message: string }[] = [
    { type: "normal", reason: "ScalingReplicaSet", message: "Scaled up replica set to 6" },
    { type: "warning", reason: "FailedScheduling", message: "0/5 nodes are available: insufficient cpu" },
    { type: "normal", reason: "Pulled", message: "Container image pulled successfully" },
    { type: "warning", reason: "OOMKilled", message: "Container was OOMKilled, restarting" },
    { type: "normal", reason: "Started", message: "Started container after rollout" },
    { type: "warning", reason: "ProbeFailed", message: "Readiness probe failed: HTTP 503" },
    { type: "normal", reason: "ScaleDown", message: "Scaled down replica set (cooldown elapsed)" },
  ];
  return Array.from({ length: 10 }).map((_, i) => {
    const service = SERVICES[Math.floor(rand() * SERVICES.length)];
    const tmpl = templates[Math.floor(rand() * templates.length)];
    return {
      id: `evt-${i}`,
      type: tmpl.type,
      reason: tmpl.reason,
      service: service.label,
      message: tmpl.message,
      minutesAgo: Math.floor(rand() * 55) + 1,
    };
  }).sort((a, b) => a.minutesAgo - b.minutesAgo);
}

export function getBusinessEvents(): BusinessEvent[] {
  const rand = rngFor("biz-events");
  const topics = [
    { topic: "course.like-events", service: "dir-community" },
    { topic: "crew.join-request-events", service: "dir-crew" },
    { topic: "running.run-completed-events", service: "dir-running-record" },
    { topic: "marathon.application-events", service: "dir-marathon" },
    { topic: "ai.analysis-request-events", service: "dir-ai-assistant" },
    { topic: "notification.dispatch-events", service: "dir-notification" },
  ];
  return topics.map((t, i) => {
    const roll = rand();
    const status: "ok" | "delayed" | "failed" = roll > 0.85 ? "failed" : roll > 0.65 ? "delayed" : "ok";
    return {
      id: `bevt-${i}`,
      topic: t.topic,
      service: t.service,
      status,
      minutesAgo: Math.floor(rand() * 20) + 1,
      detail:
        status === "ok"
          ? "정상 처리"
          : status === "delayed"
            ? `처리 지연 (consumer lag 증가)`
            : "처리 실패 (DLQ 적재)",
    };
  });
}

export function getKafkaTopics(): KafkaTopicStat[] {
  const rand = rngFor("kafka-topics");
  const defs = [
    { topic: "course.like-events", service: "dir-community" },
    { topic: "crew.join-request-events", service: "dir-crew" },
    { topic: "running.run-completed-events", service: "dir-running-record" },
    { topic: "marathon.application-events", service: "dir-marathon" },
    { topic: "notification.dispatch-events", service: "dir-notification" },
  ];
  return defs.map((d) => {
    const melt = SERVICE_MAP.has(d.service) ? buildServiceMelt(d.service) : null;
    const lagBoost = melt?.service.incidentProfile === "capacity" ? 4 : 1;
    const produceRate = Math.round((8 + rand() * 25) * 10) / 10;
    return {
      topic: d.topic,
      service: d.service,
      produceRate,
      consumeRate: Math.round(produceRate * (0.9 + rand() * 0.08) * 10) / 10,
      lag: Math.round(rand() * 15 * lagBoost),
      retryRate: Math.round(rand() * 3 * 10) / 10,
      dlqCount: Math.floor(rand() * (lagBoost > 1 ? 6 : 2)),
    };
  });
}

export function getDbStats(): DbStats {
  const rand = rngFor("db-stats");
  const marathon = buildServiceMelt("dir-marathon");
  const poolPct = marathon.dbPoolPct![marathon.dbPoolPct!.length - 1].v;
  const poolSize = 120;
  return {
    activeConnections: Math.round((poolPct / 100) * poolSize),
    poolSize,
    poolWaiting: poolPct > 85 ? Math.floor(rand() * 12) + 3 : Math.floor(rand() * 2),
    txLatencyMs: Math.round((8 + rand() * 6) * 10) / 10,
    slowQueries: Math.floor(rand() * 4) + (poolPct > 85 ? 5 : 0),
    locks: Math.floor(rand() * 3),
    replicationLagMs: Math.round(rand() * 400),
    postgisQueryLatencyMs: Math.round((15 + rand() * 20) * 10) / 10,
  };
}

export function getRedisStats(): RedisStats {
  const rand = rngFor("redis-stats");
  return {
    hitRatioPct: Math.round((88 + rand() * 9) * 10) / 10,
    memoryUsedMb: Math.round(1800 + rand() * 900),
    memoryMaxMb: 4096,
    evictionsPerMin: Math.round(rand() * 12),
  };
}

export function getStackHealth(): StackComponentHealth[] {
  const rand = rngFor("stack-health");
  const defs: StackComponentHealth["component"][] = ["Prometheus", "Loki", "Tempo", "Alloy"];
  return defs.map((component) => ({
    component,
    ingestionSuccessPct: Math.round((98.2 + rand() * 1.6) * 100) / 100,
    droppedPerMin: Math.round(rand() * 8),
    walErrors: Math.floor(rand() * 2),
    diskUsagePct: Math.round(40 + rand() * 35),
    queryLatencyMs: Math.round(80 + rand() * 250),
    retentionDays: component === "Tempo" ? 7 : component === "Loki" ? 14 : 30,
  }));
}

export function getPrediction(serviceId: string): PredictionHorizon {
  const melt = buildServiceMelt(serviceId);
  const rand = rngFor(`${serviceId}:prediction`);
  const history = melt.rps.slice(-30).map((p) => ({ minute: p.t, actualRps: p.v, predictedRps: p.v * (0.97 + rand() * 0.06) }));
  const lastRps = melt.rps[melt.rps.length - 1].v;
  const spikeUp = melt.service.incidentProfile === "capacity";
  const future = Array.from({ length: 15 }).map((_, i) => {
    const minute = i + 1;
    const growth = spikeUp ? 1 + minute * 0.045 : 1 + minute * 0.01;
    const predicted = lastRps * growth * (0.98 + rand() * 0.04);
    return { minute, actualRps: null, predictedRps: Math.round(predicted * 10) / 10 };
  });

  return {
    service: serviceId,
    points: [...history, ...future],
    currentReplicas: melt.service.currentReplicas,
    recommendedReplicas: melt.recommendedReplicas,
    maeRps: Math.round((1.2 + rand() * 1.8) * 10) / 10,
    mapePct: Math.round((4 + rand() * 5) * 10) / 10,
    nextScaleEtaMinutes: spikeUp ? 3 + Math.floor(rand() * 5) : null,
    modelVersion: "model-" + serviceId + "-v3.2.joblib",
  };
}

export function getScaleTimeline(serviceId: string) {
  const melt = buildServiceMelt(serviceId);
  const { service } = melt;
  const podCapacityRps = Math.max(10, Math.round((service.baseRps * 1.5) / Math.max(2, service.currentReplicas)));

  const recommendedRaw = melt.rps.map((p) =>
    Math.min(service.maxReplicas, Math.max(service.minReplicas, Math.ceil(p.v / podCapacityRps))),
  );

  const current: number[] = [];
  const cooldownSteps = 10;
  let stableFor = 0;
  let curr = recommendedRaw[0];
  for (let i = 0; i < recommendedRaw.length; i++) {
    const target = recommendedRaw[i];
    if (target > curr) {
      curr = curr + 1;
      stableFor = 0;
    } else if (target < curr) {
      stableFor++;
      if (stableFor >= cooldownSteps) {
        curr = curr - 1;
        stableFor = 0;
      }
    } else {
      stableFor = 0;
    }
    current.push(curr);
  }

  const points = melt.rps.map((p, i) => ({ t: p.t, current: current[i], recommended: recommendedRaw[i] }));

  const events: { id: string; type: "scale_out" | "scale_in" | "cron"; minutesAgo: number; fromReplicas: number; toReplicas: number; reason: string }[] = [];
  for (let i = 1; i < current.length; i++) {
    if (current[i] !== current[i - 1]) {
      events.push({
        id: `${serviceId}-scale-${i}`,
        type: current[i] > current[i - 1] ? "scale_out" : "scale_in",
        minutesAgo: Math.abs(points[i].t),
        fromReplicas: current[i - 1],
        toReplicas: current[i],
        reason:
          current[i] > current[i - 1]
            ? `예측 RPS가 Pod당 처리량 ${podCapacityRps} req/s를 초과`
            : "10분 안정화 구간 경과 (cooldown 600s)",
      });
    }
  }

  return {
    service: serviceId,
    podCapacityRps,
    points,
    events: events.slice(-8).reverse(),
  };
}

export function getCapacityGuard(serviceId: string): CapacityGuard {
  const rand = rngFor(`${serviceId}:capacity-guard`);
  const melt = buildServiceMelt(serviceId);
  const constrained = melt.service.incidentProfile === "capacity";
  const deployablePods = constrained ? 1 + Math.floor(rand() * 2) : 4 + Math.floor(rand() * 3);
  return {
    deployablePods,
    pendingPods: constrained ? 1 + Math.floor(rand() * 2) : 0,
    cpuHeadroomPods: constrained ? 2 : 5 + Math.floor(rand() * 3),
    memHeadroomPods: constrained ? 3 : 5 + Math.floor(rand() * 3),
    antiAffinityOk: !constrained || rand() > 0.5,
    maxExpandableReplicas: Math.min(melt.service.maxReplicas, melt.service.currentReplicas + deployablePods),
  };
}

export function getServiceLogs(serviceId: string) {
  const melt = buildServiceMelt(serviceId);
  const rand = rngFor(`${serviceId}:logs`);
  const okMessages = [
    "request completed",
    "cache hit",
    "scheduled job finished",
    "health check ok",
    "connection pool warmed",
  ];
  const errorPairs: [string, string][] = melt.topLogError
    ? [
        [melt.topLogError, melt.suspectedCause ?? "UNKNOWN"],
        ["Upstream 5xx response", "UPSTREAM_ERROR"],
      ]
    : [["Upstream 5xx response", "UPSTREAM_ERROR"]];

  return Array.from({ length: 14 }).map((_, i) => {
    const isError = melt.status !== "healthy" && rand() < 0.4;
    const level: "INFO" | "WARN" | "ERROR" = isError ? "ERROR" : rand() < 0.15 ? "WARN" : "INFO";
    const [msg, errType] = isError
      ? errorPairs[Math.floor(rand() * errorPairs.length)]
      : [okMessages[Math.floor(rand() * okMessages.length)], null];
    return {
      id: `${serviceId}-log-${i}`,
      timestamp: new Date(NOW - i * 47_000).toISOString(),
      level,
      message: msg,
      errorType: level === "ERROR" ? errType : null,
      durationMs: level === "ERROR" ? Math.round(800 + rand() * 3000) : Math.round(20 + rand() * 180),
    };
  });
}

export function getServiceTraces(serviceId: string) {
  const melt = buildServiceMelt(serviceId);
  const rand = rngFor(`${serviceId}:traces`);
  const base = serviceId.replace("dir-", "");
  const ops = [
    `GET /api/${base}`,
    `POST /api/${base}`,
    melt.slowTraceOperation ?? `POST /api/${base}/detail`,
    `GET /api/${base}/{id}`,
  ];
  return Array.from({ length: 10 }).map((_, i) => {
    const isSlow = melt.status !== "healthy" && i < 3;
    const duration = isSlow ? 1200 + rand() * 2200 : 40 + rand() * 400;
    return {
      id: `${serviceId}-trace-${i}`,
      operation: isSlow ? melt.slowTraceOperation ?? ops[0] : ops[Math.floor(rand() * ops.length)],
      durationMs: Math.round(duration),
      status: (isSlow && rand() < 0.5 ? "error" : "ok") as "ok" | "error",
      spanCount: 3 + Math.floor(rand() * 6),
    };
  }).sort((a, b) => b.durationMs - a.durationMs);
}

export function getAlertRules() {
  const incidents = getIncidents();
  const all = getAllMelt();
  const db = getDbStats();
  const kafkaTopics = getKafkaTopics();
  const stack = getStackHealth();
  const capacity = getCapacityGuard("dir-marathon");
  const marathonPrediction = getPrediction("dir-marathon");

  const has5xxIncident = incidents.some((i) => i.errorRatioPct > 5);
  const hasCapacityIncident = incidents.some((i) => i.suspectedCause.includes("POOL_EXHAUSTION"));
  const hasHighCpu = all.some((m) => m.cpuPct[m.cpuPct.length - 1].v > 85);
  const hasHighMem = all.some((m) => m.memPct[m.memPct.length - 1].v > 85);
  const hasRestart = all.some((m) => m.restarts > 0);
  const hasHighDisk = stack.some((s) => s.diskUsagePct > 80);
  const hasKafkaLag = kafkaTopics.some((t) => t.lag > 15);
  const capacityGap = marathonPrediction.recommendedReplicas - marathonPrediction.currentReplicas > capacity.deployablePods;

  const rules: AlertRule[] = [
    { id: "ar-1", category: "사용자 영향", name: "성공률 저하", condition: "5분 평균 성공률 < 99.0% (SLO 기반)", severity: "critical", enabled: true, firingNow: incidents.some((i) => i.severity === "critical") },
    { id: "ar-2", category: "API", name: "5xx 급증", condition: "5xx 비율 5% 초과 (최소 요청 수 10 이상)", severity: "critical", enabled: true, firingNow: has5xxIncident },
    { id: "ar-3", category: "API", name: "4xx 급증", condition: "4xx 비율이 전체 대비 15%p 이상 급증", severity: "warning", enabled: true, firingNow: false },
    { id: "ar-4", category: "Compute", name: "CPU 90%", condition: "5분 이상 CPU 사용률 90% 초과 지속", severity: "warning", enabled: true, firingNow: hasHighCpu },
    { id: "ar-5", category: "Memory", name: "Memory 80~90%", condition: "Working Set 기준 80% 경고, 90% OOM 위험", severity: "warning", enabled: true, firingNow: hasHighMem },
    { id: "ar-6", category: "Disk", name: "Disk 사용률", condition: "80% Warning, 90% Critical (증가 속도 반영)", severity: "warning", enabled: true, firingNow: hasHighDisk },
    { id: "ar-7", category: "Pod", name: "CrashLoop · Not Ready", condition: "지정 시간 기준 재시작 반복 감지", severity: "critical", enabled: true, firingNow: hasRestart },
    { id: "ar-8", category: "DB", name: "Slow Query", condition: "쿼리 fingerprint별 기준치 초과 또는 timeout", severity: "warning", enabled: true, firingNow: db.slowQueries >= 3 },
    { id: "ar-9", category: "DB", name: "Connection Pool 포화", condition: "Pool 사용률 90% 초과 5분 지속", severity: "critical", enabled: true, firingNow: hasCapacityIncident },
    { id: "ar-10", category: "Kafka", name: "Consumer Lag", condition: "Lag 임계값 초과 + 처리 지연시간 동시 충족", severity: "warning", enabled: true, firingNow: hasKafkaLag },
    { id: "ar-11", category: "Network", name: "Port · Endpoint Down", condition: "연속 3회 실패 시 Down 처리", severity: "critical", enabled: true, firingNow: true },
    { id: "ar-12", category: "Capacity", name: "HPA 확장 불가", condition: "필요 replica > 클러스터 여유", severity: "high", enabled: true, firingNow: capacityGap },
    { id: "ar-13", category: "API", name: "p95 지연시간 초과", condition: "p95 800ms 초과 5분 지속 (SLO 기반)", severity: "warning", enabled: true, firingNow: incidents.some((i) => i.p95Ms > 800) },
    { id: "ar-14", category: "Observability", name: "Telemetry 수집 중단", condition: "Prometheus 자체 관측 5분 이상 두절", severity: "critical", enabled: true, firingNow: false },
  ];
  return rules;
}

export function getNotificationPolicies(): NotificationPolicy[] {
  return [
    {
      id: "np-1",
      severity: "Critical" as const,
      condition: "서비스 전체 Down, DB HA 장애, Disk 95% 이상",
      channel: "메신저 + 문자",
      owner: "온콜 담당자",
      resendMinutes: 15,
    },
    {
      id: "np-2",
      severity: "High" as const,
      condition: "5xx 급증, HPA 확장 불가",
      channel: "담당팀 메신저 채널",
      owner: "서비스 담당팀",
      resendMinutes: 30,
    },
    {
      id: "np-3",
      severity: "Warning" as const,
      condition: "CPU · Memory 지속 상승, Consumer Lag 증가",
      channel: "모니터링 채널",
      owner: "당번 엔지니어",
      resendMinutes: 120,
    },
    {
      id: "np-4",
      severity: "Info" as const,
      condition: "배포 완료, ConfigMap · Secret 변경",
      channel: "타임라인 기록",
      owner: "-",
      resendMinutes: null,
    },
  ];
}

export function getNodeHealth(): NodeHealth[] {
  const rand = rngFor("node-health");
  return Array.from({ length: 5 }).map((_, i) => {
    const cpuPct = Math.round(35 + rand() * 55);
    const memPct = Math.round(40 + rand() * 50);
    const diskPct = Math.round(30 + rand() * 45);
    const pressure = cpuPct > 85 || memPct > 88;
    return {
      name: `worker-${i + 1}`,
      status: pressure ? "Pressure" : "Ready",
      cpuPct,
      memPct,
      diskPct,
      pods: 4 + Math.floor(rand() * 6),
      podCapacity: 12,
    };
  });
}

export function getEndpointHealth(): EndpointHealth[] {
  const rand = rngFor("endpoint-health");
  const defs: { name: string; port: number; purpose: string; forceDown?: boolean; forceDegraded?: boolean }[] = [
    { name: "Istio Gateway", port: 443, purpose: "외부 진입" },
    { name: "Grafana", port: 3000, purpose: "대시보드" },
    { name: "PostgreSQL Primary", port: 5432, purpose: "DB 연결" },
    { name: "Kafka Broker", port: 9092, purpose: "Broker", forceDegraded: true },
    { name: "Harbor Registry", port: 443, purpose: "Registry" },
    { name: "CI/CD SSH", port: 22, purpose: "관리 접근", forceDown: true },
  ];
  return defs.map((d, i) => {
    const status: EndpointHealth["status"] = d.forceDown ? "down" : d.forceDegraded ? "degraded" : "healthy";
    return {
      id: `ep-${i}`,
      name: d.name,
      port: d.port,
      purpose: d.purpose,
      status,
      responseMs: status === "down" ? 0 : Math.round((status === "degraded" ? 300 : 8) + rand() * 40),
      lastCheckSecondsAgo: Math.floor(rand() * 20) + 3,
      consecutiveFailures: status === "down" ? 4 + Math.floor(rand() * 6) : status === "degraded" ? 1 : 0,
    };
  });
}

const EXTRA_SERVICE_EDGES: Record<string, string[]> = {
  "dir-marathon": ["dir-notification"],
  "dir-crew": ["dir-notification"],
  "dir-ai-assistant": ["dir-course-recommendation-ai"],
};

export function getServiceDependencies(serviceId: string): ServiceDependencyEdge[] {
  const melt = buildServiceMelt(serviceId);
  const rand = rngFor(`${serviceId}:deps`);
  const edges: ServiceDependencyEdge[] = [];

  if (melt.service.hasDb) {
    const dbPool = melt.dbPoolPct ? melt.dbPoolPct[melt.dbPoolPct.length - 1].v : 30;
    edges.push({
      target: "PostgreSQL",
      kind: "db",
      rps: Math.round(melt.rps[melt.rps.length - 1].v * (1.2 + rand() * 0.6) * 10) / 10,
      errorRatioPct: Math.round(rand() * 0.4 * 100) / 100,
      p95Ms: Math.round(8 + rand() * 12),
      lag: null,
      status: dbPool > 90 ? "critical" : dbPool > 75 ? "warning" : "healthy",
    });
  }

  edges.push({
    target: "Redis",
    kind: "cache",
    rps: Math.round(melt.rps[melt.rps.length - 1].v * (2 + rand()) * 10) / 10,
    errorRatioPct: 0,
    p95Ms: Math.round(1 + rand() * 3),
    lag: null,
    status: "healthy",
  });

  if (melt.service.hasKafka) {
    const lag = melt.kafkaLag ? melt.kafkaLag[melt.kafkaLag.length - 1].v : 0;
    edges.push({
      target: `${serviceId.replace("dir-", "")}-events (Kafka)`,
      kind: "queue",
      rps: Math.round(melt.rps[melt.rps.length - 1].v * 0.3 * 10) / 10,
      errorRatioPct: 0,
      p95Ms: 0,
      lag,
      status: lag > 30 ? "critical" : lag > 12 ? "warning" : "healthy",
    });
  }

  for (const target of EXTRA_SERVICE_EDGES[serviceId] ?? []) {
    const targetMelt = buildServiceMelt(target);
    edges.push({
      target: targetMelt.service.label,
      kind: "service",
      rps: Math.round(melt.rps[melt.rps.length - 1].v * 0.2 * 10) / 10,
      errorRatioPct: targetMelt.errorRatio[targetMelt.errorRatio.length - 1].v,
      p95Ms: Math.round(targetMelt.p95Ms[targetMelt.p95Ms.length - 1].v * 0.3),
      lag: null,
      status: targetMelt.status,
    });
  }

  return edges;
}

export function getChangeEvents(): ChangeEvent[] {
  const rand = rngFor("change-events");
  const all = getAllMelt();
  const incidents = getIncidents();
  const events: ChangeEvent[] = [];

  for (const m of all) {
    if (m.recentDeploymentMinutesAgo === null) continue;
    const relatedIncident = incidents.find((i) => i.service === m.service.id) ?? null;
    const errBefore = Math.round(rand() * 0.6 * 100) / 100;
    const errAfter = m.errorRatio[m.errorRatio.length - 1].v;
    events.push({
      id: `chg-deploy-${m.service.id}`,
      type: "deploy",
      service: m.service.id,
      serviceLabel: m.service.label,
      resource: `${m.service.id}:v${1 + Math.floor(rand() * 40)}`,
      summary: `Argo CD Sync — Deployment rollout 완료`,
      minutesAgo: m.recentDeploymentMinutesAgo,
      successRatioBeforePct: Math.round((100 - errBefore) * 100) / 100,
      successRatioAfterPct: Math.round((100 - errAfter) * 100) / 100,
      p95BeforeMs: Math.round(m.p95Ms[Math.max(0, m.p95Ms.length - 25)].v),
      p95AfterMs: Math.round(m.p95Ms[m.p95Ms.length - 1].v),
      errorBeforePct: errBefore,
      errorAfterPct: errAfter,
      relatedIncidentId: relatedIncident?.id ?? null,
      rollbackable: true,
    });
  }

  const extras: { type: ChangeEvent["type"]; service: string; resource: string; summary: string; minutesAgo: number }[] = [
    { type: "config", service: "dir-running-record", resource: "ConfigMap/app-config", summary: "캐시 TTL 값 변경 (30s → 60s)", minutesAgo: 52 },
    { type: "network_policy", service: "dir-payment", resource: "NetworkPolicy/payment-egress", summary: "외부 PG사 IP 대역 추가", minutesAgo: 71 },
    { type: "secret", service: "dir-notification", resource: "Secret/sms-provider-key", summary: "SMS 발송 API 키 로테이션", minutesAgo: 88 },
    { type: "scale", service: "dir-community", resource: "HPA/dir-community", summary: "minReplicas 2 → 3 조정", minutesAgo: 34 },
    { type: "alert_rule", service: "dir-marathon", resource: "AlertRule/db-pool-saturation", summary: "DB Pool 임계치 85% → 90% 조정", minutesAgo: 96 },
  ];

  // Config/secret/scale/alert-rule changes are treated as operationally inert here — unlike a
  // deploy, they don't plausibly move p95/error-rate on their own, so their before/after values
  // are small independent jitter (not the service's real, possibly-incident-driven trajectory)
  // and they never auto-link to an incident.
  for (const e of extras) {
    const melt = buildServiceMelt(e.service);
    const baseError = Math.round(rand() * 0.5 * 100) / 100;
    const errAfter = Math.round(Math.max(0, baseError + (rand() - 0.5) * 0.3) * 100) / 100;
    const baseP95 = 90 + rand() * 40;
    const p95After = Math.round(baseP95 + (rand() - 0.5) * 20);
    events.push({
      id: `chg-${e.type}-${e.service}`,
      type: e.type,
      service: e.service,
      serviceLabel: melt.service.label,
      resource: e.resource,
      summary: e.summary,
      minutesAgo: e.minutesAgo,
      successRatioBeforePct: Math.round((100 - baseError) * 100) / 100,
      successRatioAfterPct: Math.round((100 - errAfter) * 100) / 100,
      p95BeforeMs: Math.round(baseP95),
      p95AfterMs: p95After,
      errorBeforePct: baseError,
      errorAfterPct: errAfter,
      relatedIncidentId: null,
      rollbackable: e.type === "config" || e.type === "scale",
    });
  }

  return events.sort((a, b) => a.minutesAgo - b.minutesAgo);
}

export function getStorageStats(): StorageStats {
  const rand = rngFor("storage-stats");
  return {
    pvUsedPct: Math.round(45 + rand() * 30),
    pvcCount: 14,
    longhornHealthyReplicas: 39,
    longhornTotalReplicas: 42,
    walGrowthMbPerMin: Math.round((4 + rand() * 8) * 10) / 10,
    backupAgeMinutes: Math.floor(rand() * 180) + 20,
  };
}

/**
 * Istio ztunnel operates at L4 (ambient mesh data plane) — connection counts, byte
 * counters, and mTLS state for every pod-to-pod link. This is deliberately a different
 * signal from the OTel-based RED metrics already shown per service (L7 API latency/
 * status/traces) and from Prometheus/KEDA resource metrics: ztunnel tells you whether
 * the *network path* between two workloads is healthy and encrypted, independent of
 * whether the application logic on either end is doing the right thing.
 */
export function getMeshLinks(): MeshLinkStat[] {
  const links: MeshLinkStat[] = [];
  for (const service of SERVICES) {
    const rand = rngFor(`${service.id}:mesh`);
    const melt = buildServiceMelt(service.id);
    const deps = getServiceDependencies(service.id);
    for (const dep of deps) {
      const strained = dep.status !== "healthy";
      const opened = Math.round((8 + rand() * 20) * (strained ? 1.6 : 1));
      links.push({
        id: `mesh-${service.id}-${dep.target}`,
        source: service.id,
        sourceLabel: melt.service.label,
        target: dep.target,
        kind: dep.kind,
        mtlsEnabled: !(strained && rand() < 0.15),
        connectionsOpenedPerMin: opened,
        connectionsClosedPerMin: Math.max(0, opened - Math.round(rand() * 3)),
        bytesSentPerSec: Math.round((dep.rps || 1) * (200 + rand() * 800)),
        bytesReceivedPerSec: Math.round((dep.rps || 1) * (400 + rand() * 1600)),
        l4ErrorRatioPct: Math.round((strained ? 0.8 + rand() * 2.5 : rand() * 0.3) * 100) / 100,
      });
    }
  }
  return links;
}

export function getJenkinsStats(): JenkinsStats {
  const rand = rngFor("jenkins-stats");
  return {
    queuedJobs: Math.floor(rand() * 4),
    runningJobs: 2 + Math.floor(rand() * 3),
    executorsUsed: 5 + Math.floor(rand() * 3),
    executorsTotal: 8,
    successRatePct24h: Math.round((91 + rand() * 7) * 10) / 10,
    avgBuildDurationSec: Math.round(90 + rand() * 150),
    failedBuilds: [
      { job: "dir-crew/deploy", buildNumber: 482, minutesAgo: 8, reason: "테스트 실패: CrewJoinRequestTest" },
      { job: "dir-marathon/deploy", buildNumber: 891, minutesAgo: 145, reason: "Docker build timeout" },
    ],
  };
}

export function getHarborStats(): HarborStats {
  const rand = rngFor("harbor-stats");
  return {
    pushRatePerHour: Math.round(4 + rand() * 10),
    pullRatePerHour: Math.round(60 + rand() * 120),
    storageUsedGb: Math.round(180 + rand() * 60),
    storageMaxGb: 500,
    vulnerabilityCriticalCount: Math.floor(rand() * 2),
    vulnerabilityHighCount: 2 + Math.floor(rand() * 6),
    replicationOk: rand() > 0.15,
    replicationLagMinutes: Math.floor(rand() * 12),
    registryResponseMs: Math.round(15 + rand() * 25),
  };
}

export function getBackupStatuses(): BackupStatus[] {
  const rand = rngFor("backup-status");
  const defs: { system: string; expectedIntervalMinutes: number; retentionDays: number; sizeGb: number }[] = [
    { system: "PostgreSQL (Primary)", expectedIntervalMinutes: 60, retentionDays: 14, sizeGb: 42 },
    { system: "Longhorn Volume Snapshot", expectedIntervalMinutes: 240, retentionDays: 7, sizeGb: 310 },
    { system: "Harbor Registry", expectedIntervalMinutes: 1440, retentionDays: 30, sizeGb: 190 },
    { system: "Jenkins (JCasC + Jobs)", expectedIntervalMinutes: 1440, retentionDays: 30, sizeGb: 3 },
    { system: "Redis (RDB Snapshot)", expectedIntervalMinutes: 30, retentionDays: 3, sizeGb: 2 },
    { system: "Prometheus/Loki/Tempo Config", expectedIntervalMinutes: 1440, retentionDays: 30, sizeGb: 1 },
  ];
  return defs.map((d, i) => {
    const roll = rand();
    const lastBackupMinutesAgo =
      roll > 0.85
        ? d.expectedIntervalMinutes * (3 + rand() * 4) // failed — very stale
        : roll > 0.65
          ? Math.round(d.expectedIntervalMinutes * (1.3 + rand() * 0.8)) // delayed
          : Math.round(rand() * d.expectedIntervalMinutes * 0.9); // on schedule
    const status: BackupStatus["status"] =
      lastBackupMinutesAgo > d.expectedIntervalMinutes * 3 ? "failed" : lastBackupMinutesAgo > d.expectedIntervalMinutes * 1.2 ? "delayed" : "ok";
    return {
      id: `backup-${i}`,
      system: d.system,
      lastBackupMinutesAgo: Math.round(lastBackupMinutesAgo),
      sizeGb: Math.round(d.sizeGb * (0.9 + rand() * 0.2) * 10) / 10,
      status,
      retentionDays: d.retentionDays,
      expectedIntervalMinutes: d.expectedIntervalMinutes,
    };
  });
}

export const AVAILABLE_CAPACITY_RPS = 260;
