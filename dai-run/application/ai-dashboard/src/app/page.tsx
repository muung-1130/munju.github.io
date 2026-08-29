import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Meter } from "@/components/ui/Meter";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { IncidentCard } from "@/components/incidents/IncidentCard";
import { ServiceHealthGrid } from "@/components/services/ServiceHealthGrid";
import { BarChart } from "@/components/charts/BarChart";
import { Gauge } from "@/components/charts/Gauge";
import { formatTimeAgo } from "@/lib/format";
import { LIVE_CONTAINER_MAP } from "@/lib/live";
import { getLiveServiceRed } from "@/lib/otel-metrics";
import {
  getCapacityGuard,
  getChangeEvents,
  getIncidents,
  getKubernetesEvents,
  getOverview,
  getPrediction,
  getServiceSummaries,
} from "@/lib/mock";
import type { ServiceSummary } from "@/lib/types";

const CHANGE_TYPE_LABEL: Record<string, string> = {
  deploy: "배포",
  config: "설정 변경",
  secret: "Secret",
  network_policy: "NetworkPolicy",
  scale: "Scale 설정",
  alert_rule: "Alert Rule",
};

export default async function OverviewPage() {
  const overview = getOverview();
  const mockServices = getServiceSummaries();
  const incidents = getIncidents();
  const events = getKubernetesEvents().slice(0, 6);
  const changes = getChangeEvents().slice(0, 5);

  // Compact combined feed for the right-rail "업데이트" panel — mirrors the
  // reference's "Market Updates" list (icon + one-liner + relative time).
  const updatesFeed = [
    ...events.map((e) => ({ id: `evt-${e.id}`, icon: e.type === "warning" ? "⚠" : "●", text: `${e.reason} · ${e.service}`, minutesAgo: e.minutesAgo })),
    ...changes.map((c) => ({ id: `chg-${c.id}`, icon: "↻", text: `${CHANGE_TYPE_LABEL[c.type]} · ${c.serviceLabel}`, minutesAgo: c.minutesAgo })),
  ]
    .sort((a, b) => a.minutesAgo - b.minutesAgo)
    .slice(0, 5);

  // Blend in real RPS/p95/error-rate (OTel via Prometheus) for the services that
  // have a real container mapped — everything else (and the two services with no
  // real counterpart yet) keeps the simulated MELT trajectory. Health/Incident/
  // prediction stay simulated on purpose: see docs/ai-diagnosis-integration-guide.md.
  const liveEntries = await Promise.all(
    mockServices.map(async (s) => {
      const containerJob = LIVE_CONTAINER_MAP[s.id];
      if (!containerJob) return null;
      const red = await getLiveServiceRed(containerJob);
      return red ? ([s.id, red] as const) : null;
    }),
  );
  const liveRedMap = new Map(liveEntries.filter((e): e is readonly [string, NonNullable<(typeof liveEntries)[number]>[1]] => e !== null));

  const services: ServiceSummary[] = mockServices.map((s) => {
    const live = liveRedMap.get(s.id);
    if (!live) return s;
    return {
      ...s,
      rps: live.rpsNow,
      p95Ms: live.p95Ms ?? s.p95Ms,
      errorRatioPct: live.errorRatioPctNow,
      sparkline: live.series.map((p) => p.rps),
    };
  });
  const liveMappedCount = liveRedMap.size;

  // "Top movers" panel: % change from first to last sparkline point, same
  // idea as a market ticker's 24h change — sorted by magnitude.
  const topMovers = services
    .map((s) => {
      const first = s.sparkline[0] ?? 0;
      const last = s.sparkline[s.sparkline.length - 1] ?? 0;
      const pctChange = first > 0 ? ((last - first) / first) * 100 : 0;
      return { id: s.id, label: s.label, pctChange };
    })
    .sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange))
    .slice(0, 4);

  const avgErrorPct = services.reduce((sum, s) => sum + s.errorRatioPct, 0) / services.length;
  const avgP95 = Math.round(services.reduce((sum, s) => sum + s.p95Ms, 0) / services.length);
  const successRatePct = Math.round((100 - avgErrorPct) * 100) / 100;
  const sloViolations = services.filter((s) => s.p95Ms > 800 || s.errorRatioPct > 5).length;
  const affectedUsers = incidents.reduce((sum, i) => sum + (i.affectedUsers ?? 0), 0);

  const marathonPrediction = getPrediction("dir-marathon");
  const marathonCapacity = getCapacityGuard("dir-marathon");
  const marathonGap = marathonPrediction.recommendedReplicas - marathonPrediction.currentReplicas;
  const marathonNarrative =
    marathonGap > 0
      ? marathonGap > marathonCapacity.deployablePods
        ? `10분 뒤 Marathon Service는 ${marathonGap}개 replica가 추가로 필요하지만, 현재 클러스터 자원으로는 ${marathonCapacity.deployablePods}개만 추가할 수 있습니다.`
        : `10분 뒤 Marathon Service는 ${marathonGap}개 replica가 추가로 필요하며, 클러스터 여유(${marathonCapacity.deployablePods}개)로 충분히 대응 가능합니다.`
      : "10분 내 예측 트래픽 기준으로 추가 확장이 필요한 서비스가 없습니다.";

  const replicaCategories = services.map((s) => ({
    id: s.id,
    label: s.label,
    values: { current: s.currentReplicas, recommended: s.recommendedReplicas },
  }));

  return (
    <>
      <Topbar title="Overview" subtitle="사용자 영향 중심 Command Center · 17개 서비스" />
      <main className="flex-1 gap-5 p-4 md:p-6 xl:flex xl:items-start">
      <div className="min-w-0 flex-1 space-y-5">
        {/* 사용자 영향 */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              사용자 영향
            </h2>
            {liveMappedCount > 0 && <LiveBadge label={`성공률·p95 · LIVE (${liveMappedCount}/${services.length}개 서비스)`} />}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label="전체 요청 성공률"
              value={`${successRatePct}`}
              unit="%"
              delta={successRatePct >= 99 ? "SLO 이내" : "SLO 위반"}
              deltaGood={successRatePct >= 99}
            />
            <StatTile
              label="p95 응답시간"
              value={avgP95.toLocaleString()}
              unit="ms"
              delta={avgP95 > 800 ? "SLO 근접" : "SLO 이내"}
              deltaGood={avgP95 <= 800}
            />
            <StatTile label="활성 사용자" value="Mock" delta="RUM 연동 예정 · Planned" deltaGood="neutral" />
            <StatTile label="프론트엔드 에러율" value="Mock" delta="RUM 연동 예정 · Planned" deltaGood="neutral" />
            <StatTile
              label="영향받은 사용자(추정)"
              value={affectedUsers.toLocaleString()}
              unit="명"
              delta={`Incident ${incidents.length}건 기준`}
              deltaGood={incidents.length === 0}
            />
            <StatTile
              label="SLO 위반 서비스"
              value={`${sloViolations}`}
              unit={`/ ${services.length}`}
              delta={sloViolations === 0 ? "전체 정상" : "확인 필요"}
              deltaGood={sloViolations === 0}
            />
          </div>
        </section>

        {/* 진행 중 Incident */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              진행 중 Incident
            </h2>
            <Link href="/incidents" className="text-xs font-medium hover:underline" style={{ color: "var(--series-1)" }}>
              Incidents & Alerts 전체 보기 →
            </Link>
          </div>
          {incidents.length === 0 ? (
            <Card>
              <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                현재 감지된 이상징후가 없습니다.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {incidents.map((inc) => (
                <IncidentCard key={inc.id} incident={inc} variant="compact" />
              ))}
            </div>
          )}
        </section>

        {/* 예측과 클러스터 여유도 */}
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <Card title="10분 후 트래픽 예측 (시뮬레이션)">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    현재 RPS
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular" style={{ color: "var(--text-primary)" }}>
                    {overview.totalRps}
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    예측 RPS (+10m)
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular" style={{ color: "var(--series-1)" }}>
                    {overview.predicted10m}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                서비스별 상세 예측은 Predictive Autoscaling 페이지에서 확인할 수 있습니다.
              </p>
            </Card>
            <Card title="Pod 확장 상태 (시뮬레이션)" subtitle="현재 replica vs AI 권장 replica">
              <BarChart
                categories={replicaCategories}
                series={[
                  { id: "current", label: "현재", color: "var(--series-1)" },
                  { id: "recommended", label: "AI 권장", color: "var(--series-2)" },
                ]}
                unit=""
              />
            </Card>
          </div>

          <div className="space-y-4">
            <Card title="클러스터 여유도 (시뮬레이션)">
              <div className="space-y-3">
                <Meter label="CPU 사용률" pct={overview.clusterCpuPct} />
                <Meter label="Memory 사용률" pct={overview.clusterMemPct} />
                <Meter
                  label="Pod 배치 가능도"
                  pct={(overview.podsUsed / overview.podsAvailable) * 100}
                  detail={`${overview.podsUsed} / ${overview.podsAvailable} pod 사용 중`}
                />
              </div>
              <p
                className="mt-4 rounded-lg px-3 py-2 text-xs leading-relaxed"
                style={{
                  background: marathonGap > marathonCapacity.deployablePods ? "color-mix(in oklab, var(--status-critical) 10%, transparent)" : "var(--surface-page)",
                  color: marathonGap > marathonCapacity.deployablePods ? "var(--status-critical)" : "var(--text-secondary)",
                }}
              >
                {marathonNarrative}
              </p>
              <Link href="/autoscaling" className="mt-2 inline-block text-xs font-medium hover:underline" style={{ color: "var(--series-1)" }}>
                Predictive Autoscaling에서 Capacity Guard 자세히 보기 →
              </Link>
            </Card>
          </div>
        </section>

        {/* 건강 상태 */}
        <Card
          title="서비스 건강 지표"
          subtitle={liveMappedCount > 0 ? `전체 서비스 MELT 요약 · RPS/p95/오류율 ${liveMappedCount}개 서비스 실측` : "전체 서비스 MELT 요약 (시뮬레이션)"}
        >
          <ServiceHealthGrid services={services} />
        </Card>

        {/* 변경 이벤트 */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Card title="최근 Kubernetes 이벤트 (시뮬레이션)">
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {events.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <div className="min-w-0">
                    <span
                      className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ background: e.type === "warning" ? "var(--status-warning)" : "var(--status-good)" }}
                    />
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {e.reason}
                    </span>{" "}
                    · {e.service}
                    <p className="mt-0.5 truncate pl-3.5" style={{ color: "var(--text-muted)" }}>
                      {e.message}
                    </p>
                  </div>
                  <span className="shrink-0 tabular" style={{ color: "var(--text-muted)" }}>
                    {formatTimeAgo(e.minutesAgo)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title="최근 변경 이벤트 (시뮬레이션)"
            subtitle="배포 · 설정 변경과 장애 상관관계"
            action={
              <Link href="/changes" className="text-xs font-medium hover:underline" style={{ color: "var(--series-1)" }}>
                전체 이력 →
              </Link>
            }
          >
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {changes.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <div className="min-w-0">
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                      [{CHANGE_TYPE_LABEL[c.type]}]
                    </span>{" "}
                    {c.serviceLabel} · {c.summary}
                    {c.relatedIncidentId && (
                      <span className="ml-1.5 font-medium" style={{ color: "var(--status-critical)" }}>
                        ⚠ Incident 연관
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 tabular" style={{ color: "var(--text-muted)" }}>
                    {formatTimeAgo(c.minutesAgo)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>

      <aside className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:mt-0 xl:w-80 xl:shrink-0 xl:grid-cols-1">
        <Card title="서비스 Health" subtitle="전체 요청 성공률 기준">
          <div className="flex flex-col items-center pt-1">
            <Gauge value={successRatePct} label={successRatePct >= 99 ? "양호" : successRatePct >= 95 ? "주의" : "위험"} />
          </div>
        </Card>

        <Card title="변동 큰 서비스" subtitle="RPS 구간 내 변화율">
          <ul className="space-y-2.5">
            {topMovers.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: m.pctChange >= 0 ? "var(--status-good)" : "var(--status-critical)" }}
                  aria-hidden
                >
                  {m.label.slice(0, 1)}
                </span>
                <Link href={`/services/${m.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline" style={{ color: "var(--text-primary)" }}>
                  {m.label}
                </Link>
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular"
                  style={{
                    color: m.pctChange >= 0 ? "var(--status-good)" : "var(--status-critical)",
                    background: `color-mix(in oklab, ${m.pctChange >= 0 ? "var(--status-good)" : "var(--status-critical)"} 14%, transparent)`,
                  }}
                >
                  {m.pctChange >= 0 ? "↗" : "↘"} {Math.abs(m.pctChange).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="최근 업데이트" subtitle="이벤트 · 변경 통합" className="sm:col-span-2 xl:col-span-1">
          <ul className="space-y-3">
            {updatesFeed.map((u) => (
              <li key={u.id} className="flex items-start gap-2.5 text-xs">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "var(--surface-page)", color: "var(--text-secondary)" }}
                  aria-hidden
                >
                  {u.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate" style={{ color: "var(--text-primary)" }}>
                    {u.text}
                  </p>
                  <p style={{ color: "var(--text-muted)" }}>{formatTimeAgo(u.minutesAgo)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
      </main>
    </>
  );
}
