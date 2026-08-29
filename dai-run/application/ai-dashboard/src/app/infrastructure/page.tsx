import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { StatTile } from "@/components/ui/StatTile";
import { Meter } from "@/components/ui/Meter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { BarChart } from "@/components/charts/BarChart";
import { formatBytesPerSec, formatTimeAgo } from "@/lib/format";
import {
  getLiveContainerResourceByName,
  getLiveHostStats,
  getLiveVulnerabilitySummary,
  getRealServerHostStats,
  LIVE_INFRA_CONTAINER_MAP,
} from "@/lib/live";
import { getLiveDbStats } from "@/lib/db";
import { getLiveRedisStats } from "@/lib/redis-live";
import { getLivePostgresBackup, getLiveMongoBackup } from "@/lib/live-backups";
import {
  getAllMelt,
  getBackupStatuses,
  getDbStats,
  getEndpointHealth,
  getHarborStats,
  getJenkinsStats,
  getKafkaTopics,
  getKubernetesEvents,
  getMeshLinks,
  getNodeHealth,
  getRedisStats,
  getStackHealth,
  getStorageStats,
} from "@/lib/mock";

const TABS = [
  { id: "compute", label: "Kubernetes / Compute" },
  { id: "network", label: "Network & Availability" },
  { id: "mesh", label: "Service Mesh" },
  { id: "kafka", label: "Kafka" },
  { id: "database", label: "Database & Cache" },
  { id: "cicd", label: "CI/CD" },
  { id: "storage", label: "Storage & Backups" },
];

export default async function InfrastructurePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.id === tabParam) ? (tabParam as string) : "compute";

  const kafkaTopics = getKafkaTopics();
  const db = getDbStats();
  const redis = getRedisStats();
  const stack = getStackHealth();
  const nodes = getNodeHealth();
  const endpoints = getEndpointHealth();
  const storage = getStorageStats();
  const meshLinks = getMeshLinks();
  const jenkins = getJenkinsStats();
  const harbor = getHarborStats();
  const backups = getBackupStatuses();
  const [
    liveHost,
    liveRealServerHost,
    liveDb,
    liveRedis,
    liveDbContainer,
    liveRedisContainer,
    liveKafkaContainer,
    liveVulns,
    livePgBackup,
    liveMongoBackup,
  ] = await Promise.all([
    getLiveHostStats(),
    getRealServerHostStats(),
    getLiveDbStats(),
    getLiveRedisStats(),
    getLiveContainerResourceByName(LIVE_INFRA_CONTAINER_MAP.postgres),
    getLiveContainerResourceByName(LIVE_INFRA_CONTAINER_MAP.redis),
    getLiveContainerResourceByName(LIVE_INFRA_CONTAINER_MAP.kafka),
    getLiveVulnerabilitySummary(),
    getLivePostgresBackup(),
    getLiveMongoBackup(),
  ]);
  const all = getAllMelt();
  const podEvents = getKubernetesEvents()
    .filter((e) => e.type === "warning")
    .slice(0, 6);

  const lagCategories = kafkaTopics.map((t) => ({ id: t.topic, label: t.topic, values: { lag: t.lag } }));
  const lagColorOverrides = Object.fromEntries(
    kafkaTopics.map((t) => [
      t.topic,
      t.lag > 30 ? "var(--status-critical)" : t.lag > 12 ? "var(--status-warning)" : "var(--series-5)",
    ]),
  );

  const restartingServices = all.filter((m) => m.restarts > 0);
  const pressureNodes = nodes.filter((n) => n.status === "Pressure");

  const mtlsGapLinks = meshLinks.filter((l) => !l.mtlsEnabled);
  const mtlsRatioPct = Math.round((1 - mtlsGapLinks.length / meshLinks.length) * 1000) / 10;
  const totalOpenedPerMin = meshLinks.reduce((s, l) => s + l.connectionsOpenedPerMin, 0);
  const avgL4ErrorPct = Math.round((meshLinks.reduce((s, l) => s + l.l4ErrorRatioPct, 0) / meshLinks.length) * 100) / 100;

  function backupStatusFor(ageMinutes: number, expectedIntervalMinutes: number): "ok" | "delayed" | "failed" {
    if (ageMinutes > expectedIntervalMinutes * 3) return "failed";
    if (ageMinutes > expectedIntervalMinutes * 1.2) return "delayed";
    return "ok";
  }

  const blendedBackups = backups.map((b) => {
    if (b.system === "PostgreSQL (Primary)" && livePgBackup) {
      const sizeGb = Math.round((livePgBackup.sizeMb / 1024) * 10000) / 10000;
      return { ...b, lastBackupMinutesAgo: livePgBackup.ageMinutes, sizeGb, status: backupStatusFor(livePgBackup.ageMinutes, b.expectedIntervalMinutes), isLive: true };
    }
    return { ...b, isLive: false };
  });
  if (liveMongoBackup) {
    const expectedIntervalMinutes = 1440;
    blendedBackups.push({
      id: "backup-mongo-live",
      system: "MongoDB (Snapshot)",
      lastBackupMinutesAgo: liveMongoBackup.ageMinutes,
      sizeGb: Math.round((liveMongoBackup.sizeMb / 1024) * 10000) / 10000,
      status: backupStatusFor(liveMongoBackup.ageMinutes, expectedIntervalMinutes),
      retentionDays: 7,
      expectedIntervalMinutes,
      isLive: true,
    });
  }

  const failedBackups = blendedBackups.filter((b) => b.status === "failed");
  const delayedBackups = blendedBackups.filter((b) => b.status === "delayed");

  return (
    <>
      <Topbar title="Infrastructure" subtitle="Kubernetes · Network · Kafka · DB · Storage · 관측 파이프라인" />
      <main className="flex-1 space-y-5 p-4 md:p-6">
        <Tabs tabs={TABS} active={tab} basePath="/infrastructure" />

        {tab === "compute" && (
          <div className="space-y-5">
            {liveHost && (
              <Card title="실시간 호스트 상태 (dev 컨테이너)" subtitle={`node-exporter · ${liveHost.hostname} (${liveHost.cpuCores} vCPU)`} action={<LiveBadge />}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatTile label="CPU 사용률" value={`${liveHost.cpuUsagePct}`} unit="%" />
                  <StatTile label="Memory 사용률" value={`${liveHost.memUsedPct}`} unit="%" />
                  <StatTile label="Disk 사용률" value={`${liveHost.diskUsedPct}`} unit="%" />
                  <StatTile label="Load Average (1m)" value={`${liveHost.load1}`} />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Meter label="Memory" pct={liveHost.memUsedPct} detail={`${(liveHost.memTotalGb - liveHost.memAvailableGb).toFixed(1)}GB / ${liveHost.memTotalGb}GB`} />
                  <Meter label="Disk" pct={liveHost.diskUsedPct} detail={`${(liveHost.diskTotalGb - liveHost.diskAvailGb).toFixed(1)}GB / ${liveHost.diskTotalGb}GB`} />
                </div>
                <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  이 대시보드가 실행 중인 dev 환경 자체의 호스트입니다. 목표 Kubernetes 클러스터가 아닙니다.
                </p>
              </Card>
            )}

            {liveRealServerHost && (
              <Card
                title="실시간 K8s Control Plane (dir-master1)"
                subtitle={`node-exporter · 192.168.0.200 · ${liveRealServerHost.hostname} (${liveRealServerHost.cpuCores} vCPU)`}
                action={<LiveBadge />}
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatTile label="CPU 사용률" value={`${liveRealServerHost.cpuUsagePct}`} unit="%" />
                  <StatTile label="Memory 사용률" value={`${liveRealServerHost.memUsedPct}`} unit="%" />
                  <StatTile label="Disk 사용률" value={`${liveRealServerHost.diskUsedPct}`} unit="%" />
                  <StatTile label="Load Average (1m)" value={`${liveRealServerHost.load1}`} />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Meter label="Memory" pct={liveRealServerHost.memUsedPct} detail={`${(liveRealServerHost.memTotalGb - liveRealServerHost.memAvailableGb).toFixed(1)}GB / ${liveRealServerHost.memTotalGb}GB`} />
                  <Meter label="Disk" pct={liveRealServerHost.diskUsedPct} detail={`${(liveRealServerHost.diskTotalGb - liveRealServerHost.diskAvailGb).toFixed(1)}GB / ${liveRealServerHost.diskTotalGb}GB`} />
                </div>
                <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  실제 온프레미스 K8s control-plane 노드(dir-master1, 192.168.0.200)의 node-exporter 값입니다. Prometheus/Loki/Tempo는 이
                  클러스터에서 아직 외부로 노출되지 않아, 그 부분은 dev 환경의 관측 스택 값으로 대체 표시합니다.
                </p>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Ready 노드" value={`${nodes.length - pressureNodes.length}`} unit={`/ ${nodes.length}`} deltaGood={pressureNodes.length === 0} delta={pressureNodes.length > 0 ? `Pressure ${pressureNodes.length}개` : "전체 정상"} />
              <StatTile label="재시작 발생 서비스" value={`${restartingServices.length}`} unit={`/ ${all.length}`} deltaGood={restartingServices.length === 0} delta={restartingServices.length > 0 ? "확인 필요" : "안정"} />
              <StatTile label="총 Pod 배치" value={`${nodes.reduce((s, n) => s + n.pods, 0)}`} unit={`/ ${nodes.reduce((s, n) => s + n.podCapacity, 0)}`} />
              <StatTile label="경고 이벤트" value={`${podEvents.length}`} unit="건 (최근)" />
            </div>

            <Card title="노드 상태 (시뮬레이션)" subtitle="워커 노드별 CPU · Memory · Disk · Pod 배치">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                      <th className="px-3 py-2 font-medium">노드</th>
                      <th className="px-3 py-2 font-medium">상태</th>
                      <th className="px-3 py-2 text-right font-medium">CPU</th>
                      <th className="px-3 py-2 text-right font-medium">Memory</th>
                      <th className="px-3 py-2 text-right font-medium">Disk</th>
                      <th className="px-3 py-2 text-right font-medium">Pod</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((n) => (
                      <tr key={n.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                          {n.name}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs font-medium" style={{ color: n.status === "Pressure" ? "var(--status-warning)" : "var(--success-text)" }}>
                            {n.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: n.cpuPct > 85 ? "var(--status-critical)" : "var(--text-primary)" }}>
                          {n.cpuPct}%
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: n.memPct > 88 ? "var(--status-critical)" : "var(--text-primary)" }}>
                          {n.memPct}%
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {n.diskPct}%
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {n.pods} / {n.podCapacity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Pod 상태 이벤트" subtitle="Not Ready · Pending · CrashLoopBackOff · OOMKilled">
              {podEvents.length === 0 ? (
                <p className="py-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  최근 경고 이벤트가 없습니다.
                </p>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {podEvents.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <span style={{ color: "var(--text-primary)" }}>
                        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "var(--status-warning)" }} />
                        <span className="font-medium">{e.reason}</span> · {e.service} — {e.message}
                      </span>
                      <span className="shrink-0 tabular" style={{ color: "var(--text-muted)" }}>
                        {formatTimeAgo(e.minutesAgo)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {tab === "network" && (
          <div className="space-y-5">
            <Card title="계층별 헬스체크" subtitle="포트 8080이 열려 있어도 애플리케이션 /health는 500일 수 있습니다">
              <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                <Step label="L4 Port 상태" />
                <Arrow />
                <Step label="HTTP Health Endpoint" />
                <Arrow />
                <Step label="실제 API Synthetic 요청" />
                <Arrow />
                <Step label="서비스 의존성 상태" />
              </div>
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                DAI RUN은 HAProxy 대신 Istio Gateway와 Kubernetes Service를 사용합니다. Gateway·HTTPRoute 상태, Backend Pod 건강도, 4xx·5xx,
                서비스 간 latency는 Kiali/Istio 연동으로 확인합니다.
              </p>
            </Card>

            <Card title="Endpoint / Port Health">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                      <th className="px-3 py-2 font-medium">대상</th>
                      <th className="px-3 py-2 text-right font-medium">Port</th>
                      <th className="px-3 py-2 font-medium">의미</th>
                      <th className="px-3 py-2 font-medium">상태</th>
                      <th className="px-3 py-2 text-right font-medium">응답시간</th>
                      <th className="px-3 py-2 text-right font-medium">마지막 체크</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpoints.map((e) => (
                      <tr key={e.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
                          {e.name}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-secondary)" }}>
                          {e.port}
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                          {e.purpose}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className="text-xs font-medium"
                            style={{
                              color: e.status === "healthy" ? "var(--success-text)" : e.status === "degraded" ? "var(--status-warning)" : "var(--status-critical)",
                            }}
                          >
                            {e.status === "healthy" ? "Healthy" : e.status === "degraded" ? "Degraded" : "Down"}
                          </span>
                          {e.consecutiveFailures > 0 && (
                            <span className="ml-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                              (연속 실패 {e.consecutiveFailures}회)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {e.status === "down" ? "-" : `${e.responseMs}ms`}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular text-xs" style={{ color: "var(--text-muted)" }}>
                          {e.lastCheckSecondsAgo}초 전
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {tab === "mesh" && (
          <div className="space-y-5">
            <Card title="관측 신호 분리" subtitle="ztunnel(L4) · OpenTelemetry(L7) · Prometheus/KEDA(리소스) — 서로 다른 계층을 담당">
              <div className="grid gap-3 sm:grid-cols-3">
                <SignalRole title="ztunnel (L4)" detail="서비스 연결량 · mTLS 상태 · 전송량 · L4 오류 — 네트워크 경로 자체의 건강도" />
                <SignalRole title="OpenTelemetry (L7)" detail="API latency · HTTP status · trace · AI 호출 구간 — 애플리케이션 동작" />
                <SignalRole title="Prometheus / KEDA" detail="CPU · Memory · Kafka lag · in-flight — 리소스와 확장 신호" />
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                label="mTLS 적용률"
                value={`${mtlsRatioPct}`}
                unit="%"
                deltaGood={mtlsGapLinks.length === 0}
                delta={mtlsGapLinks.length === 0 ? "전체 링크 암호화" : `${mtlsGapLinks.length}개 링크 미적용`}
              />
              <StatTile label="분당 신규 연결" value={`${totalOpenedPerMin}`} unit="conn/min" />
              <StatTile
                label="평균 L4 오류율"
                value={`${avgL4ErrorPct}`}
                unit="%"
                deltaGood={avgL4ErrorPct < 1}
                delta={avgL4ErrorPct < 1 ? "안정" : "확인 필요"}
              />
              <StatTile label="관측 대상 링크" value={`${meshLinks.length}`} unit="개" />
            </div>

            <Card title="서비스 메시 링크" subtitle="ztunnel 기준 pod-to-pod L4 연결 (istio_tcp_* 지표)">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                      <th className="px-3 py-2 font-medium">연결</th>
                      <th className="px-3 py-2 font-medium">mTLS</th>
                      <th className="px-3 py-2 text-right font-medium">Opened/min</th>
                      <th className="px-3 py-2 text-right font-medium">Closed/min</th>
                      <th className="px-3 py-2 text-right font-medium">Sent</th>
                      <th className="px-3 py-2 text-right font-medium">Received</th>
                      <th className="px-3 py-2 text-right font-medium">L4 오류율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meshLinks.map((l) => (
                      <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
                          {l.sourceLabel} <span style={{ color: "var(--text-muted)" }}>→</span> {l.target}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs font-medium" style={{ color: l.mtlsEnabled ? "var(--success-text)" : "var(--status-critical)" }}>
                            {l.mtlsEnabled ? "STRICT" : "미적용"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {l.connectionsOpenedPerMin}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {l.connectionsClosedPerMin}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {formatBytesPerSec(l.bytesSentPerSec)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {formatBytesPerSec(l.bytesReceivedPerSec)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right tabular font-medium"
                          style={{ color: l.l4ErrorRatioPct > 1 ? "var(--status-critical)" : "var(--text-primary)" }}
                        >
                          {l.l4ErrorRatioPct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {tab === "kafka" && (
          <div className="space-y-5">
            {liveKafkaContainer && (
              <Card title="실시간 Kafka Broker 리소스" subtitle="cAdvisor · container &quot;dai-run-kafka-broker&quot;" action={<LiveBadge />}>
                <div className="flex flex-wrap gap-6">
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      CPU 사용량
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular" style={{ color: "var(--text-primary)" }}>
                      {liveKafkaContainer.cpuCores.toFixed(3)} <span className="text-sm font-normal">core</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      Memory 사용량
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular" style={{ color: "var(--text-primary)" }}>
                      {liveKafkaContainer.memoryMb.toFixed(1)} <span className="text-sm font-normal">MB</span>
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  실제 Broker 컨테이너 리소스입니다. 아래 토픽별 lag·produce/consume rate는 아직 exporter가 없어 시뮬레이션 값입니다.
                </p>
              </Card>
            )}

            <Card title="Kafka Consumer Lag" subtitle="토픽별 지연 메시지 수 (시뮬레이션)">
              <BarChart
                categories={lagCategories}
                series={[{ id: "lag", label: "Lag", color: "var(--series-5)" }]}
                colorOverrides={lagColorOverrides}
              />
            </Card>

            <Card title="Kafka 토픽 상세">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                      <th className="px-3 py-2 font-medium">토픽</th>
                      <th className="px-3 py-2 font-medium">서비스</th>
                      <th className="px-3 py-2 text-right font-medium">Produce/s</th>
                      <th className="px-3 py-2 text-right font-medium">Consume/s</th>
                      <th className="px-3 py-2 text-right font-medium">Lag</th>
                      <th className="px-3 py-2 text-right font-medium">Retry/s</th>
                      <th className="px-3 py-2 text-right font-medium">DLQ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kafkaTopics.map((t) => (
                      <tr key={t.topic} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                          {t.topic}
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                          {t.service}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {t.produceRate}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {t.consumeRate}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right tabular font-medium"
                          style={{ color: t.lag > 30 ? "var(--status-critical)" : t.lag > 12 ? "var(--status-warning)" : "var(--text-primary)" }}
                        >
                          {t.lag}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {t.retryRate}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right tabular font-medium"
                          style={{ color: t.dlqCount > 0 ? "var(--status-critical)" : "var(--text-primary)" }}
                        >
                          {t.dlqCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {tab === "database" && (
          <section className="grid gap-4 lg:grid-cols-2">
            {liveDb && (
              <Card title="실시간 PostgreSQL" subtitle="dai_run · 실제 DB 접속" action={<LiveBadge />}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatTile label="Connections" value={`${liveDb.totalConnections}`} unit={`/ ${liveDb.maxConnections}`} />
                  <StatTile label="Active / Idle" value={`${liveDb.activeConnections} / ${liveDb.idleConnections}`} />
                  <StatTile label="대기 중인 Lock" value={`${liveDb.waitingLocks}`} deltaGood={liveDb.waitingLocks === 0} delta={liveDb.waitingLocks === 0 ? "없음" : "확인 필요"} />
                  <StatTile label="가장 오래된 쿼리" value={`${liveDb.longestQuerySeconds}`} unit="초" />
                  <StatTile label="DB 크기" value={`${liveDb.databaseSizeMb.toLocaleString()}`} unit="MB" />
                  <StatTile label="Cache Hit Ratio" value={`${liveDb.cacheHitRatioPct}`} unit="%" deltaGood={liveDb.cacheHitRatioPct > 95} delta={liveDb.cacheHitRatioPct > 95 ? "양호" : "관찰 필요"} />
                </div>
                <div className="mt-4">
                  <Meter label="Connection 사용률" pct={(liveDb.totalConnections / liveDb.maxConnections) * 100} />
                </div>
                <ContainerMiniStat resource={liveDbContainer} />
              </Card>
            )}

            <Card title="PostgreSQL (시뮬레이션)" subtitle="목표 K8s 배포 기준 replication·PostGIS 포함">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile label="Active Connections" value={`${db.activeConnections}`} unit={`/ ${db.poolSize}`} />
                <StatTile label="Pool Waiting" value={`${db.poolWaiting}`} deltaGood={db.poolWaiting === 0} delta={db.poolWaiting > 0 ? "대기 발생" : "대기 없음"} />
                <StatTile label="Transaction Latency" value={`${db.txLatencyMs}`} unit="ms" />
                <StatTile label="Slow Queries" value={`${db.slowQueries}`} deltaGood={db.slowQueries < 3} delta={db.slowQueries >= 3 ? "점검 필요" : "정상"} />
                <StatTile label="Locks" value={`${db.locks}`} />
                <StatTile label="Replication Lag" value={`${db.replicationLagMs}`} unit="ms" />
                <StatTile label="PostGIS Query Latency" value={`${db.postgisQueryLatencyMs}`} unit="ms" />
              </div>
              <div className="mt-4">
                <Meter label="Connection Pool 사용률" pct={(db.activeConnections / db.poolSize) * 100} />
              </div>
            </Card>

            {liveRedis && (
              <Card title="실시간 Redis" subtitle="demo-redis · 실제 INFO 응답" action={<LiveBadge />}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatTile label="Connected Clients" value={`${liveRedis.connectedClients}`} />
                  <StatTile label="Hit Ratio" value={`${liveRedis.hitRatioPct}`} unit="%" deltaGood={liveRedis.hitRatioPct > 90} delta={liveRedis.hitRatioPct > 90 ? "양호" : "관찰 필요"} />
                  <StatTile label="Evicted Keys" value={`${liveRedis.evictedKeys}`} deltaGood={liveRedis.evictedKeys === 0} delta={liveRedis.evictedKeys === 0 ? "없음" : "메모리 압박"} />
                  <StatTile label="Total Keys" value={`${liveRedis.totalKeys}`} />
                  <StatTile label="Uptime" value={`${liveRedis.uptimeDays}`} unit="일" />
                  <StatTile label="Used Memory" value={`${liveRedis.usedMemoryMb}`} unit="MB" />
                </div>
                <div className="mt-4">
                  {liveRedis.maxMemoryMb > 0 ? (
                    <Meter label="Memory 사용률" pct={(liveRedis.usedMemoryMb / liveRedis.maxMemoryMb) * 100} detail={`${liveRedis.usedMemoryMb}MB / ${liveRedis.maxMemoryMb}MB`} />
                  ) : (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      maxmemory 제한 없음 (개발 환경) — 사용량만 표시합니다.
                    </p>
                  )}
                </div>
                <ContainerMiniStat resource={liveRedisContainer} />
              </Card>
            )}

            <Card title="Redis (시뮬레이션)" subtitle="목표 K8s 배포 기준 requests/limits 대비">
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Hit Ratio" value={`${redis.hitRatioPct}`} unit="%" deltaGood={redis.hitRatioPct > 90} delta={redis.hitRatioPct > 90 ? "양호" : "관찰 필요"} />
                <StatTile label="Evictions" value={`${redis.evictionsPerMin}`} unit="/min" deltaGood={redis.evictionsPerMin < 5} delta={redis.evictionsPerMin < 5 ? "안정" : "메모리 압박"} />
              </div>
              <div className="mt-4">
                <Meter
                  label="Memory 사용률"
                  pct={(redis.memoryUsedMb / redis.memoryMaxMb) * 100}
                  detail={`${redis.memoryUsedMb.toLocaleString()}MB / ${redis.memoryMaxMb.toLocaleString()}MB`}
                />
              </div>
            </Card>
          </section>
        )}

        {tab === "cicd" && (
          <div className="space-y-5">
            <Card
              title="실시간 취약점 스캔"
              subtitle="Pushgateway · CI가 push한 Trivy 결과 (job=pushgateway, honor_labels)"
              action={<LiveBadge />}
            >
              {liveVulns ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatTile label="Critical" value={`${liveVulns.critical}`} deltaGood={liveVulns.critical === 0} delta={liveVulns.critical === 0 ? "없음" : "즉시 확인 필요"} />
                  <StatTile label="High" value={`${liveVulns.high}`} deltaGood={liveVulns.high === 0} delta={liveVulns.high === 0 ? "없음" : "확인 필요"} />
                  <StatTile label="Medium / Low" value={`${liveVulns.medium} / ${liveVulns.low}`} />
                  <StatTile label="스캔된 이미지" value={`${liveVulns.scannedImages}`} unit="개" />
                </div>
              ) : (
                <p className="py-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  Pushgateway에 아직 push된 Trivy 스캔 결과가 없습니다. CI에서{" "}
                  <code className="font-mono text-xs">trivy_image_vulnerabilities</code> 메트릭을 push하면 여기 표시됩니다.
                </p>
              )}
            </Card>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card title="Jenkins (시뮬레이션)" subtitle="실제 Jenkins 서버 미배포">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatTile label="대기 중 Job" value={`${jenkins.queuedJobs}`} deltaGood={jenkins.queuedJobs === 0} delta={jenkins.queuedJobs === 0 ? "대기 없음" : "확인 필요"} />
                  <StatTile label="실행 중 Job" value={`${jenkins.runningJobs}`} />
                  <StatTile label="24h 빌드 성공률" value={`${jenkins.successRatePct24h}`} unit="%" deltaGood={jenkins.successRatePct24h > 95} delta={jenkins.successRatePct24h > 95 ? "양호" : "관찰 필요"} />
                  <StatTile label="평균 빌드 시간" value={`${jenkins.avgBuildDurationSec}`} unit="초" />
                </div>
                <div className="mt-4">
                  <Meter label="Executor 사용률" pct={(jenkins.executorsUsed / jenkins.executorsTotal) * 100} detail={`${jenkins.executorsUsed} / ${jenkins.executorsTotal} executor 사용 중`} />
                </div>
                <p className="mb-1.5 mt-4 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  최근 실패 빌드
                </p>
                {jenkins.failedBuilds.length === 0 ? (
                  <p className="py-3 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                    최근 실패한 빌드가 없습니다.
                  </p>
                ) : (
                  <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {jenkins.failedBuilds.map((b) => (
                      <li key={`${b.job}-${b.buildNumber}`} className="flex items-center justify-between gap-3 py-2 text-xs">
                        <span style={{ color: "var(--text-primary)" }}>
                          <span className="font-mono">{b.job}</span> #{b.buildNumber} — {b.reason}
                        </span>
                        <span className="shrink-0 tabular" style={{ color: "var(--text-muted)" }}>
                          {formatTimeAgo(b.minutesAgo)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Harbor (시뮬레이션)" subtitle="실제 Harbor 서버 미배포 — 취약점만 위 카드에서 실측">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatTile label="Push" value={`${harbor.pushRatePerHour}`} unit="/h" />
                  <StatTile label="Pull" value={`${harbor.pullRatePerHour}`} unit="/h" />
                  <StatTile label="Registry 응답시간" value={`${harbor.registryResponseMs}`} unit="ms" />
                  <StatTile
                    label="Replication"
                    value={harbor.replicationOk ? "정상" : "지연"}
                    deltaGood={harbor.replicationOk}
                    delta={`lag ${harbor.replicationLagMinutes}분`}
                  />
                </div>
                <div className="mt-4">
                  <Meter label="Storage 사용률" pct={(harbor.storageUsedGb / harbor.storageMaxGb) * 100} detail={`${harbor.storageUsedGb}GB / ${harbor.storageMaxGb}GB`} />
                </div>
              </Card>
            </section>
          </div>
        )}

        {tab === "storage" && (
          <div className="space-y-5">
            <Card title="Storage" subtitle="PV/PVC · Longhorn Volume">
              <div className="grid grid-cols-3 gap-3">
                <StatTile label="PVC 개수" value={`${storage.pvcCount}`} />
                <StatTile label="Longhorn Replica 건강도" value={`${storage.longhornHealthyReplicas}`} unit={`/ ${storage.longhornTotalReplicas}`} deltaGood={storage.longhornHealthyReplicas === storage.longhornTotalReplicas} delta={storage.longhornHealthyReplicas === storage.longhornTotalReplicas ? "전체 정상" : "일부 저하"} />
                <StatTile label="WAL 증가 속도" value={`${storage.walGrowthMbPerMin}`} unit="MB/min" />
              </div>
              <div className="mt-4">
                <Meter label="PV 사용률" pct={storage.pvUsedPct} />
              </div>
            </Card>

            <Card
              title="백업 현황"
              subtitle="서버·시스템별 마지막 백업 시각과 상태"
              action={
                (failedBackups.length > 0 || delayedBackups.length > 0) && (
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ color: "var(--status-critical)", background: "color-mix(in oklab, var(--status-critical) 14%, transparent)" }}
                  >
                    실패 {failedBackups.length} · 지연 {delayedBackups.length}
                  </span>
                )
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                      <th className="px-3 py-2 font-medium">시스템</th>
                      <th className="px-3 py-2 font-medium">상태</th>
                      <th className="px-3 py-2 text-right font-medium">마지막 백업</th>
                      <th className="px-3 py-2 text-right font-medium">크기</th>
                      <th className="px-3 py-2 text-right font-medium">주기 (기대)</th>
                      <th className="px-3 py-2 text-right font-medium">보관 기간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blendedBackups.map((b) => (
                      <tr key={b.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
                          {b.system}
                          {b.isLive && (
                            <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--series-3)", background: "color-mix(in oklab, var(--series-3) 16%, transparent)" }}>
                              LIVE
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={b.status === "ok" ? "healthy" : b.status === "delayed" ? "warning" : "critical"} />
                        </td>
                        <td
                          className="px-3 py-2.5 text-right tabular"
                          style={{ color: b.status === "ok" ? "var(--text-primary)" : b.status === "delayed" ? "var(--status-warning)" : "var(--status-critical)" }}
                        >
                          {formatTimeAgo(b.lastBackupMinutesAgo)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {b.sizeGb >= 1 ? `${b.sizeGb}GB` : `${Math.round(b.sizeGb * 1024 * 10) / 10}MB`}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular text-xs" style={{ color: "var(--text-muted)" }}>
                          {b.expectedIntervalMinutes >= 1440 ? `${Math.round(b.expectedIntervalMinutes / 1440)}일마다` : `${Math.round(b.expectedIntervalMinutes / 60)}시간마다`}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular text-xs" style={{ color: "var(--text-secondary)" }}>
                          {b.retentionDays}일
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                LIVE 표시 행은 실제 백업 파일(mtime·크기)을 읽은 값이고, 나머지는 아직 실제 백업 시스템이 없어 시뮬레이션입니다.
              </p>
            </Card>

            <Card title="관측 파이프라인 상태" subtitle="Prometheus · Loki · Tempo · Alloy — 관측 시스템 장애를 서비스 장애와 구분">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                      <th className="px-3 py-2 font-medium">컴포넌트</th>
                      <th className="px-3 py-2 text-right font-medium">Ingestion 성공률</th>
                      <th className="px-3 py-2 text-right font-medium">Dropped/min</th>
                      <th className="px-3 py-2 text-right font-medium">WAL 오류</th>
                      <th className="px-3 py-2 text-right font-medium">Disk 사용률</th>
                      <th className="px-3 py-2 text-right font-medium">Query Latency</th>
                      <th className="px-3 py-2 text-right font-medium">Retention</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stack.map((c) => (
                      <tr key={c.component} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
                          {c.component}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right tabular"
                          style={{ color: c.ingestionSuccessPct < 99 ? "var(--status-warning)" : "var(--text-primary)" }}
                        >
                          {c.ingestionSuccessPct}%
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {c.droppedPerMin}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right tabular"
                          style={{ color: c.walErrors > 0 ? "var(--status-critical)" : "var(--text-primary)" }}
                        >
                          {c.walErrors}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {c.diskUsagePct}%
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                          {c.queryLatencyMs}ms
                        </td>
                        <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-secondary)" }}>
                          {c.retentionDays}일
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </main>
    </>
  );
}

function Step({ label }: { label: string }) {
  return (
    <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--border)", background: "var(--surface-page)" }}>
      {label}
    </span>
  );
}

function Arrow() {
  return (
    <span aria-hidden style={{ color: "var(--text-muted)" }}>
      →
    </span>
  );
}

function SignalRole({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-page)" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {detail}
      </p>
    </div>
  );
}

function ContainerMiniStat({ resource }: { resource: { containerName: string; cpuCores: number; memoryMb: number } | null }) {
  if (!resource) return null;
  return (
    <p className="mt-3 border-t pt-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
      컨테이너 리소스 ({resource.containerName}): CPU {resource.cpuCores.toFixed(3)} core · Memory {resource.memoryMb.toFixed(1)}MB
    </p>
  );
}
