import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { StatusBadge, statusColor } from "@/components/ui/StatusBadge";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { IncidentCard } from "@/components/incidents/IncidentCard";
import { AiDiagnosisPanel } from "@/components/services/AiDiagnosisPanel";
import { getStoredDiagnosis } from "@/lib/ai-results-store";
import { LineChart, type ChartPoint } from "@/components/charts/LineChart";
import { formatTimeAgo } from "@/lib/format";
import { getLiveContainerResource, LIVE_CONTAINER_MAP } from "@/lib/live";
import { getLiveServiceRed } from "@/lib/otel-metrics";
import { getLiveLogs } from "@/lib/loki";
import { getLiveTraces } from "@/lib/tempo";
import {
  SERVICES,
  SERVICE_MAP,
  buildServiceMelt,
  getBusinessEvents,
  getChangeEvents,
  getIncidents,
  getKubernetesEvents,
  getServiceDependencies,
} from "@/lib/mock";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "metrics", label: "Metrics" },
  { id: "dependencies", label: "Dependencies" },
  { id: "logs", label: "Logs" },
  { id: "traces", label: "Traces" },
  { id: "events", label: "Events & Changes" },
  { id: "ai", label: "AI Diagnosis" },
];

const DEP_KIND_LABEL: Record<string, string> = { service: "서비스", db: "데이터베이스", cache: "캐시", queue: "메시지 큐" };

export default async function ServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ service: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { service: serviceId } = await params;
  if (!SERVICE_MAP.has(serviceId)) notFound();
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.id === tabParam) ? (tabParam as string) : "summary";

  const melt = buildServiceMelt(serviceId);
  const containerName = LIVE_CONTAINER_MAP[serviceId] ?? null;

  const [liveResource, liveRed, liveLogs, liveTraces, storedDiagnosis] = await Promise.all([
    getLiveContainerResource(serviceId),
    containerName ? getLiveServiceRed(containerName) : Promise.resolve(null),
    containerName ? getLiveLogs(containerName, 12) : Promise.resolve(null),
    containerName ? getLiveTraces(containerName, 10) : Promise.resolve(null),
    containerName ? getStoredDiagnosis(containerName) : Promise.resolve(null),
  ]);

  // Measured values: real RED metrics win whenever they exist for this service;
  // otherwise fall back to the simulated MELT trajectory. Health Score / SLO /
  // Incident stay tied to the simulated AI-narrative layer on purpose — see
  // docs/ai-diagnosis-integration-guide.md for how that should read real data.
  const rpsNow = liveRed?.rpsNow ?? melt.rps[melt.rps.length - 1].v;
  const errorNow = liveRed?.errorRatioPctNow ?? melt.errorRatio[melt.errorRatio.length - 1].v;
  const p95Now = Math.round(liveRed?.p95Ms ?? melt.p95Ms[melt.p95Ms.length - 1].v);
  const healthScore = Math.max(5, Math.round(100 - melt.anomalyScore * 60 - errorNow * 3 - (p95Now > 800 ? 10 : 0)));
  const sloOk = p95Now <= 800 && errorNow <= 5;
  const incident = getIncidents().find((i) => i.service === serviceId) ?? null;

  const changeEvents = getChangeEvents().filter((c) => c.service === serviceId);
  const latestDeploy = changeEvents.find((c) => c.type === "deploy");

  const mockRpsData: ChartPoint[] = melt.rps.map((p) => ({ t: p.t, rps: p.v }));
  const mockLatencyData: ChartPoint[] = melt.p95Ms.map((p) => ({ t: p.t, p95: p.v }));
  const mockErrorData: ChartPoint[] = melt.errorRatio.map((p) => ({ t: p.t, error: p.v }));
  const resourceData: ChartPoint[] = melt.cpuPct.map((p, i) => ({ t: p.t, cpu: p.v, mem: melt.memPct[i].v }));
  const dbData: ChartPoint[] | null = melt.dbPoolPct ? melt.dbPoolPct.map((p) => ({ t: p.t, dbPool: p.v })) : null;
  const kafkaData: ChartPoint[] | null = melt.kafkaLag ? melt.kafkaLag.map((p) => ({ t: p.t, lag: p.v })) : null;

  const liveCpuData: ChartPoint[] = liveResource ? liveResource.series.map((p) => ({ t: p.t, cpu: p.cpuCores })) : [];
  const liveMemData: ChartPoint[] = liveResource ? liveResource.series.map((p) => ({ t: p.t, mem: p.memoryMb })) : [];
  const liveRpsData: ChartPoint[] = liveRed ? liveRed.series.map((p) => ({ t: p.t, rps: p.rps })) : [];
  const liveP95Data: ChartPoint[] = liveRed ? liveRed.series.map((p) => ({ t: p.t, p95: p.p95Ms ?? undefined })) : [];
  const liveErrorData: ChartPoint[] = liveRed ? liveRed.series.map((p) => ({ t: p.t, error: p.errorRatioPct })) : [];

  const dependencies = getServiceDependencies(serviceId);
  const k8sEvents = getKubernetesEvents()
    .filter((e) => e.service === melt.service.label)
    .slice(0, 5);
  const bizEvents = getBusinessEvents().filter((e) => e.service === serviceId);

  return (
    <>
      <Topbar title={melt.service.label} subtitle={`${serviceId} · Health Score ${healthScore}`} />
      <main className="flex-1 space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap gap-1.5">
          {SERVICES.map((s) => (
            <Link
              key={s.id}
              href={`/services/${s.id}?tab=${tab}`}
              className="rounded-full px-3 py-1.5 text-xs font-medium"
              style={{
                color: s.id === serviceId ? "var(--text-primary)" : "var(--text-secondary)",
                background: s.id === serviceId ? "color-mix(in oklab, var(--series-1) 16%, transparent)" : "var(--surface-1)",
                border: "1px solid var(--border)",
              }}
            >
              {s.label}
            </Link>
          ))}
        </div>

        <section className="flex flex-wrap items-center gap-3">
          <StatusBadge status={melt.status} className="text-sm" />
          {melt.recentDeploymentMinutesAgo !== null && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              최근 배포: {formatTimeAgo(melt.recentDeploymentMinutesAgo)}
            </span>
          )}
          {containerName && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              컨테이너: <span className="font-mono">{containerName}</span>
            </span>
          )}
        </section>

        <Tabs tabs={TABS} active={tab} basePath={`/services/${serviceId}`} />

        {tab === "summary" && (
          <div className="space-y-4">
            <Card title="서비스 요약" action={liveRed && <LiveBadge label="RPS/오류율/p95 · LIVE" />}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <SummaryStat label="Health Score" value={`${healthScore}`} accent={statusColor(melt.status)} />
                <SummaryStat label="RPS" value={rpsNow.toFixed(3)} />
                <SummaryStat label="성공률 / 오류율" value={`${(100 - errorNow).toFixed(1)}% / ${errorNow.toFixed(1)}%`} />
                <SummaryStat label="p95" value={liveRed && liveRed.p95Ms === null ? "데이터 없음" : `${p95Now}ms`} />
                <SummaryStat label="활성 Incident" value={incident ? "1건" : "0건"} accent={incident ? "var(--status-critical)" : undefined} />
                <SummaryStat label="현재 / 권장 replica" value={`${melt.service.currentReplicas} → ${melt.recommendedReplicas}`} />
                <SummaryStat label="배포 버전" value={latestDeploy?.resource.split(":")[1] ?? "N/A"} />
                <SummaryStat label="SLO 상태" value={sloOk ? "SLO 이내" : "SLO 위반"} accent={sloOk ? "var(--success-text)" : "var(--status-critical)"} />
              </div>
              {!liveRed && (
                <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  RPS/오류율/p95는 이 서비스에 대한 실측 OTel 지표가 없어 시뮬레이션 값입니다.
                </p>
              )}
            </Card>

            <Card title="AI 요약">
              {melt.status === "healthy" ? (
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  현재 규칙 기반 임계치와 IsolationForest 이상 탐지 모두 이상 징후를 발견하지 못했습니다.
                </p>
              ) : (
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  {incident?.headline}{" "}
                  <Link href="/incidents" className="font-medium hover:underline" style={{ color: "var(--series-1)" }}>
                    AI Diagnosis 탭에서 근거 전체 보기 →
                  </Link>
                </p>
              )}
              <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                이 카드는 AI 진단 서술 예시입니다 — 실제 이상탐지 파이프라인 연동 방법은{" "}
                <code className="font-mono">docs/ai-diagnosis-integration-guide.md</code>를 참고하세요.
              </p>
            </Card>
          </div>
        )}

        {tab === "metrics" && (
          <section className="grid gap-4 lg:grid-cols-2">
            {liveResource && (
              <Card
                title="실시간 컨테이너 리소스"
                subtitle={`cAdvisor · container "${liveResource.containerName}"`}
                className="lg:col-span-2"
                action={<LiveBadge />}
              >
                <div className="mb-3 flex flex-wrap gap-6">
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      CPU 사용량
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular" style={{ color: "var(--text-primary)" }}>
                      {liveResource.cpuCores.toFixed(3)} <span className="text-sm font-normal">core</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      Memory 사용량
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular" style={{ color: "var(--text-primary)" }}>
                      {liveResource.memoryMb.toFixed(1)} <span className="text-sm font-normal">MB</span>
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      CPU (지난 30분)
                    </p>
                    <LineChart series={[{ id: "cpu", label: "CPU", color: "var(--series-1)" }]} data={liveCpuData} unit=" core" decimals={3} showArea />
                  </div>
                  <div>
                    <p className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      Memory (지난 30분)
                    </p>
                    <LineChart series={[{ id: "mem", label: "Memory", color: "var(--series-3)" }]} data={liveMemData} unit="MB" decimals={1} showArea />
                  </div>
                </div>
              </Card>
            )}

            {liveRed ? (
              <>
                <Card title="RPS" subtitle={`OTel http_server_duration · ${liveRed.totalRequestsInWindow}개 시계열`} action={<LiveBadge />}>
                  <LineChart series={[{ id: "rps", label: "RPS", color: "var(--series-1)" }]} data={liveRpsData} unit=" req/s" decimals={3} showArea />
                  <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    이 dev 환경은 트래픽이 드물어(주로 health check) 1시간 rate 창을 사용합니다 — 값이 대부분 0에 가까운 것이 정상입니다.
                  </p>
                </Card>
                <Card title="p95 지연시간" action={<LiveBadge />}>
                  <LineChart
                    series={[{ id: "p95", label: "p95", color: "var(--series-7)" }]}
                    data={liveP95Data}
                    unit="ms"
                    referenceLine={{ value: 800, label: "SLO 800ms" }}
                  />
                </Card>
                <Card title="오류율" action={<LiveBadge />}>
                  <LineChart
                    series={[{ id: "error", label: "오류율", color: "var(--series-8)" }]}
                    data={liveErrorData}
                    unit="%"
                    referenceLine={{ value: 5, label: "5% 임계치" }}
                  />
                </Card>
              </>
            ) : (
              <>
                <Card title="RPS (시뮬레이션)">
                  <LineChart series={[{ id: "rps", label: "RPS", color: "var(--series-1)" }]} data={mockRpsData} unit=" req/s" showArea />
                </Card>
                <Card title="p95 지연시간 (시뮬레이션)">
                  <LineChart
                    series={[{ id: "p95", label: "p95", color: "var(--series-7)" }]}
                    data={mockLatencyData}
                    unit="ms"
                    referenceLine={{ value: 800, label: "SLO 800ms" }}
                  />
                </Card>
                <Card title="오류율 (시뮬레이션)">
                  <LineChart
                    series={[{ id: "error", label: "오류율", color: "var(--series-8)" }]}
                    data={mockErrorData}
                    unit="%"
                    referenceLine={{ value: 5, label: "5% 임계치" }}
                  />
                </Card>
              </>
            )}

            <Card title="CPU · Memory (목표 K8s 배포 시뮬레이션)" subtitle="requests/limits 대비 %">
              <LineChart
                series={[
                  { id: "cpu", label: "CPU", color: "var(--series-1)" },
                  { id: "mem", label: "Memory", color: "var(--series-3)" },
                ]}
                data={resourceData}
                unit="%"
              />
            </Card>
            {dbData && (
              <Card title="DB Connection Pool (시뮬레이션)">
                <LineChart
                  series={[{ id: "dbPool", label: "Pool 사용률", color: "var(--series-4)" }]}
                  data={dbData}
                  unit="%"
                  referenceLine={{ value: 90, label: "90% 경고" }}
                />
              </Card>
            )}
            {kafkaData && (
              <Card title="Kafka Consumer Lag (시뮬레이션)">
                <LineChart series={[{ id: "lag", label: "Lag", color: "var(--series-5)" }]} data={kafkaData} unit=" msg" />
              </Card>
            )}
          </section>
        )}

        {tab === "dependencies" && (
          <Card title="의존성 맵" subtitle={`${melt.service.label}이(가) 직접 의존하는 리소스 (시뮬레이션)`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                    <th className="px-3 py-2 font-medium">대상</th>
                    <th className="px-3 py-2 font-medium">종류</th>
                    <th className="px-3 py-2 text-right font-medium">RPS</th>
                    <th className="px-3 py-2 text-right font-medium">오류율</th>
                    <th className="px-3 py-2 text-right font-medium">p95 / Lag</th>
                    <th className="px-3 py-2 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {dependencies.map((d) => (
                    <tr key={d.target} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
                        {melt.service.label} → {d.target}
                      </td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                        {DEP_KIND_LABEL[d.kind]}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                        {d.rps}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                        {d.errorRatioPct}%
                      </td>
                      <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                        {d.lag !== null ? `lag ${d.lag}` : `${d.p95Ms}ms`}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === "logs" && (
          <Card
            title="관련 로그"
            subtitle={liveLogs ? "Loki · 실제 컨테이너 stdout/stderr (최근 7일)" : "구조화 JSON 로그 (시뮬레이션)"}
            action={liveLogs && <LiveBadge label="LIVE · Loki" />}
          >
            {liveLogs ? (
              liveLogs.length === 0 ? (
                <p className="py-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  최근 7일 내 로그가 없습니다.
                </p>
              ) : (
                <ul className="space-y-1.5 font-mono text-xs">
                  {liveLogs.map((l) => (
                    <li key={l.id} className="flex items-start gap-2">
                      <span
                        className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold"
                        style={{
                          color: l.level === "ERROR" ? "var(--status-critical)" : l.level === "WARN" ? "var(--status-warning)" : "var(--text-muted)",
                          background: "var(--surface-page)",
                        }}
                      >
                        {l.level}
                      </span>
                      <span className="min-w-0 truncate" style={{ color: "var(--text-secondary)" }} title={l.line}>
                        {l.line}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="py-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                이 서비스는 Loki에 아직 로그 스트림이 없습니다.
              </p>
            )}
          </Card>
        )}

        {tab === "traces" && (
          <Card title="최근 Trace" subtitle={liveTraces ? "Tempo · 실제 trace 검색 결과" : undefined} action={liveTraces && <LiveBadge label="LIVE · Tempo" />}>
            {liveTraces ? (
              liveTraces.length === 0 ? (
                <p className="py-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  최근 trace가 없습니다.
                </p>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {liveTraces.map((t) => {
                    return (
                      <li key={t.traceId} className="flex items-center justify-between gap-3 py-2 text-xs">
                        <span className="min-w-0">
                          <span className="truncate font-mono" style={{ color: "var(--text-primary)" }}>
                            {t.rootTraceName}
                          </span>
                          <span className="ml-2 font-mono" style={{ color: "var(--text-muted)" }}>
                            {t.traceId.slice(0, 12)}…
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="tabular" style={{ color: "var(--text-muted)" }}>
                            {formatTimeAgo(t.minutesAgo)}
                          </span>
                          <span className="tabular" style={{ color: t.durationMs > 1000 ? statusColor("warning") : "var(--text-muted)" }}>
                            {t.durationMs}ms
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              <p className="py-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                이 서비스는 Tempo에 아직 trace가 없습니다.
              </p>
            )}
          </Card>
        )}

        {tab === "events" && (
          <section className="grid gap-4 lg:grid-cols-2">
            <Card title="Kubernetes 이벤트 (시뮬레이션)">
              {k8sEvents.length === 0 ? (
                <p className="py-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  최근 이벤트가 없습니다.
                </p>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {k8sEvents.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <span style={{ color: "var(--text-primary)" }}>
                        <span
                          className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                          style={{ background: e.type === "warning" ? "var(--status-warning)" : "var(--status-good)" }}
                        />
                        {e.reason} — {e.message}
                      </span>
                      <span className="shrink-0 tabular" style={{ color: "var(--text-muted)" }}>
                        {formatTimeAgo(e.minutesAgo)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="비즈니스 이벤트 (Kafka) (시뮬레이션)">
              {bizEvents.length === 0 ? (
                <p className="py-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  연결된 Kafka 토픽이 없습니다.
                </p>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {bizEvents.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <span style={{ color: "var(--text-primary)" }}>
                        <span
                          className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                          style={{
                            background:
                              e.status === "ok" ? "var(--status-good)" : e.status === "delayed" ? "var(--status-warning)" : "var(--status-critical)",
                          }}
                        />
                        {e.topic} — {e.detail}
                      </span>
                      <span className="shrink-0 tabular" style={{ color: "var(--text-muted)" }}>
                        {formatTimeAgo(e.minutesAgo)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="변경 이력" subtitle="배포 · 설정 변경 (시뮬레이션)" className="lg:col-span-2">
              {changeEvents.length === 0 ? (
                <p className="py-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  최근 변경 이력이 없습니다.
                </p>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {changeEvents.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <span style={{ color: "var(--text-primary)" }}>
                        <span className="font-mono" style={{ color: "var(--text-muted)" }}>
                          {c.resource}
                        </span>{" "}
                        — {c.summary}
                      </span>
                      <span className="shrink-0 tabular" style={{ color: "var(--text-muted)" }}>
                        {formatTimeAgo(c.minutesAgo)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/changes" className="mt-2 inline-block text-xs font-medium hover:underline" style={{ color: "var(--series-1)" }}>
                전체 변경 이력 보기 →
              </Link>
            </Card>
          </section>
        )}

        {tab === "ai" && (
          <div className="space-y-4">
            <AiDiagnosisPanel containerJob={containerName} initialResult={storedDiagnosis} />
            {incident ? (
              <IncidentCard incident={incident} />
            ) : (
              <Card title="규칙 기반 진단 (Mock)" subtitle="IsolationForest 이상 탐지 시뮬레이션 — 실측 아님">
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  규칙 기반 임계치와 IsolationForest 이상 탐지 모두 이상 징후를 발견하지 못했습니다. 이상 점수{" "}
                  {(melt.anomalyScore * 100).toFixed(0)}점 · 신뢰도 {(melt.confidence * 100).toFixed(0)}%로 정상 범위입니다.
                </p>
              </Card>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-semibold tabular" style={{ color: accent ?? "var(--text-primary)" }} title={value}>
        {value}
      </p>
    </div>
  );
}
