import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { LineChart, type ChartPoint } from "@/components/charts/LineChart";
import { formatTimeAgo } from "@/lib/format";
import { SERVICES, buildServiceMelt, getCapacityGuard, getPrediction, getScaleTimeline } from "@/lib/mock";

export default async function AutoscalingPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service: serviceParam } = await searchParams;
  const serviceId = SERVICES.some((s) => s.id === serviceParam) ? (serviceParam as string) : "dir-marathon";

  const melt = buildServiceMelt(serviceId);
  const prediction = getPrediction(serviceId);
  const scaleTimeline = getScaleTimeline(serviceId);
  const capacityGuard = getCapacityGuard(serviceId);

  const rpsData: ChartPoint[] = prediction.points.map((p) => ({
    t: p.minute,
    actual: p.actualRps ?? undefined,
    predicted: p.predictedRps,
  }));

  const replicaData: ChartPoint[] = scaleTimeline.points.map((p) => ({
    t: p.t,
    current: p.current,
    recommended: p.recommended,
  }));

  const resourceData: ChartPoint[] = melt.cpuPct.map((p, i) => ({
    t: p.t,
    cpu: p.v,
    mem: melt.memPct[i].v,
  }));

  const latencyData: ChartPoint[] = melt.p95Ms.map((p) => ({ t: p.t, p95: p.v }));

  const wastedPodMinutes = scaleTimeline.points.reduce((sum, p) => sum + Math.max(0, p.current - p.recommended), 0);
  const overPredictionCount = prediction.points.filter(
    (p) => p.actualRps !== null && p.predictedRps > p.actualRps * 1.15,
  ).length;

  const gapPods = prediction.recommendedReplicas - melt.service.currentReplicas;
  const capacityShort = gapPods > 0 && capacityGuard.deployablePods < gapPods;

  const clusterView = SERVICES.map((s) => {
    const p = getPrediction(s.id);
    const c = getCapacityGuard(s.id);
    const gap = p.recommendedReplicas - p.currentReplicas;
    return { service: s, gap, guard: c, blocked: gap > 0 && c.deployablePods < gap };
  });
  const blockedServices = clusterView.filter((v) => v.blocked);

  return (
    <>
      <Topbar title="Predictive Autoscaling" subtitle="Demand Forecast · Replica Decision · Capacity Guard" />
      <main className="flex-1 space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap gap-1.5">
          {SERVICES.map((s) => (
            <Link
              key={s.id}
              href={`/autoscaling?service=${s.id}`}
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

        {capacityShort && (
          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: "var(--status-critical)", background: "color-mix(in oklab, var(--status-critical) 10%, transparent)", color: "var(--status-critical)" }}
          >
            10분 후 {melt.service.label}에 {prediction.recommendedReplicas}개 Pod가 필요하지만, 현재 클러스터에는{" "}
            {capacityGuard.deployablePods}개까지만 배치 가능합니다. Scale 명령 대신 Capacity Alert가 발생합니다.
          </div>
        )}

        {/* Demand Forecast */}
        <section className="space-y-3">
          <SectionHeading title="Demand Forecast" subtitle="실측·예측 RPS와 예측 오차" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="예측 정확도"
              value={`${prediction.mapePct}%`}
              unit="MAPE"
              delta={`MAE ${prediction.maeRps} req/s`}
              deltaGood={prediction.mapePct < 10}
            />
            <StatTile label="과잉 예측 횟수" value={`${overPredictionCount}`} unit="회" deltaGood={overPredictionCount === 0} delta={overPredictionCount === 0 ? "최근 30분 이내" : "확인 필요"} />
            <StatTile label="예측 구간" value="5·10·15분" />
            <StatTile label="모델 버전" value={prediction.modelVersion.split("-").slice(-1)[0]} />
          </div>
          <Card title="실측 RPS vs 예측 RPS" subtitle="5·10·15분 예측 (모델: 시계열 회귀)">
            <LineChart
              series={[
                { id: "actual", label: "실측 RPS", color: "var(--series-1)" },
                { id: "predicted", label: "예측 RPS", color: "var(--series-2)" },
              ]}
              data={rpsData}
              unit=" req/s"
            />
          </Card>
        </section>

        {/* Replica Decision */}
        <section className="space-y-3">
          <SectionHeading title="Replica Decision" subtitle="실제 replica · AI 권장 replica · Shadow Mode 근거" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="현재 / AI 권장 replica" value={`${melt.service.currentReplicas} → ${prediction.recommendedReplicas}`} />
            <StatTile
              label="다음 예상 Scale-out"
              value={prediction.nextScaleEtaMinutes ? `${prediction.nextScaleEtaMinutes}분 후` : "예정 없음"}
            />
            <StatTile label="Pod당 처리 가능 RPS" value={`${scaleTimeline.podCapacityRps}`} unit="req/s (k6 벤치마크)" />
            <StatTile label="과도 확장 Pod-minute" value={`${wastedPodMinutes}`} deltaGood={wastedPodMinutes < 20} delta={wastedPodMinutes < 20 ? "낭비 적음" : "확인 필요"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="실제 replica vs AI 권장 replica" subtitle="Shadow Mode — HPA는 실제 replica만 반영">
              <LineChart
                series={[
                  { id: "current", label: "실제 replica", color: "var(--series-1)" },
                  { id: "recommended", label: "AI 권장 replica", color: "var(--series-2)" },
                ]}
                data={replicaData}
                yMinZero
                decimals={0}
              />
            </Card>
            <Card title="적용 시 예상 CPU · p95" subtitle="AI 권장 replica로 확장했을 경우의 시뮬레이션">
              <LineChart
                series={[
                  { id: "cpu", label: "CPU", color: "var(--series-1)" },
                  { id: "mem", label: "Memory", color: "var(--series-3)" },
                ]}
                data={resourceData}
                unit="%"
                referenceLine={{ value: 70, label: "70% 기준선" }}
              />
              <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                p95는 아래 &ldquo;p95 지연시간&rdquo; 차트를 함께 참고하세요. SLO(800ms) 초과 구간은 확장 필요 신호입니다.
              </p>
            </Card>
          </div>

          <Card title="p95 지연시간" subtitle="서비스 SLO 대비">
            <LineChart
              series={[{ id: "p95", label: "p95", color: "var(--series-7)" }]}
              data={latencyData}
              unit="ms"
              showArea
              referenceLine={{ value: 800, label: "SLO 800ms" }}
            />
          </Card>

          <Card title="Scale-out · Scale-in 이벤트">
            {scaleTimeline.events.length === 0 ? (
              <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                최근 1시간 내 스케일 이벤트가 없습니다.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                {scaleTimeline.events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          color: e.type === "scale_out" ? "var(--series-1)" : "var(--series-2)",
                          background: `color-mix(in oklab, ${e.type === "scale_out" ? "var(--series-1)" : "var(--series-2)"} 14%, transparent)`,
                        }}
                      >
                        {e.type === "scale_out" ? "Scale-out" : "Scale-in"}
                      </span>
                      <span className="tabular" style={{ color: "var(--text-primary)" }}>
                        {e.fromReplicas} → {e.toReplicas}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>{e.reason}</span>
                    </div>
                    <span className="shrink-0 tabular text-xs" style={{ color: "var(--text-muted)" }}>
                      {formatTimeAgo(e.minutesAgo)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* Capacity Guard */}
        <section className="space-y-3">
          <SectionHeading title="Capacity Guard" subtitle="온프렘 자원 한도 — AI 권장이 실제 배치 가능량을 넘지 않도록 보호" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="On-prem Capacity Guard">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-secondary)" }}>즉시 배치 가능 Pod (requests 기준)</dt>
                  <dd className="tabular font-medium" style={{ color: "var(--text-primary)" }}>
                    {capacityGuard.deployablePods}개
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-secondary)" }}>Pending 상태 Pod</dt>
                  <dd className="tabular font-medium" style={{ color: "var(--text-primary)" }}>
                    {capacityGuard.pendingPods}개
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-secondary)" }}>CPU 여유 (Pod 환산)</dt>
                  <dd className="tabular font-medium" style={{ color: "var(--text-primary)" }}>
                    {capacityGuard.cpuHeadroomPods}개
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-secondary)" }}>Memory 여유 (Pod 환산)</dt>
                  <dd className="tabular font-medium" style={{ color: "var(--text-primary)" }}>
                    {capacityGuard.memHeadroomPods}개
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-secondary)" }}>Pod anti-affinity 충족 가능</dt>
                  <dd className="font-medium" style={{ color: capacityGuard.antiAffinityOk ? "var(--success-text)" : "var(--status-critical)" }}>
                    {capacityGuard.antiAffinityOk ? "가능" : "불가 — 동일 노드 집중 위험"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-secondary)" }}>최대 확장 가능 replica</dt>
                  <dd className="tabular font-medium" style={{ color: "var(--text-primary)" }}>
                    {capacityGuard.maxExpandableReplicas}개
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Storage 여유와 노드별 CPU · Memory 여유는{" "}
                <Link href="/infrastructure?tab=compute" className="font-medium hover:underline" style={{ color: "var(--series-1)" }}>
                  Infrastructure → Kubernetes / Compute
                </Link>
                에서 확인할 수 있습니다.
              </p>
            </Card>

            <Card title="확장 불가능 서비스" subtitle="AI 권장 replica가 즉시 배치 가능량을 초과하는 서비스">
              {blockedServices.length === 0 ? (
                <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  현재 용량 부족으로 확장이 막힌 서비스가 없습니다.
                </p>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {blockedServices.map((v) => (
                    <li key={v.service.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <Link href={`/autoscaling?service=${v.service.id}`} className="font-medium hover:underline" style={{ color: "var(--text-primary)" }}>
                        {v.service.label}
                      </Link>
                      <span className="tabular text-xs" style={{ color: "var(--status-critical)" }}>
                        필요 +{v.gap} / 가능 {v.guard.deployablePods}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </section>
      </main>
    </>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {subtitle}
      </p>
    </div>
  );
}
