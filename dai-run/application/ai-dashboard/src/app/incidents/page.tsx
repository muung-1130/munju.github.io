import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { IncidentCard } from "@/components/incidents/IncidentCard";
import { getAlertRules, getIncidents, getNotificationPolicies } from "@/lib/mock";
import { getLiveAlertmanagerStatus, getLiveAlertRuleStates } from "@/lib/prometheus-alerts";

const TABS = [
  { id: "incidents", label: "Incident" },
  { id: "alerts", label: "Alert Rules" },
  { id: "notifications", label: "Notification Policy" },
];

const SEVERITY_META = {
  critical: { label: "Critical", color: "var(--status-critical)" },
  high: { label: "High", color: "var(--status-serious)" },
  warning: { label: "Warning", color: "var(--status-warning)" },
  info: { label: "Info", color: "var(--text-muted)" },
};

// Stage-1 rule id → real Prometheus alert rule name (monitoring/prometheus/rules/dairun-alert-rules.yml).
// Rules without an entry here have no real exporter yet (DB pool, Kafka lag, endpoint
// health, HPA capacity) and stay simulated — see docs/ai-diagnosis-integration-guide.md.
const REAL_ALERT_MAP: Record<string, string> = {
  "ar-2": "DairunHttp5xxRatioHigh",
  "ar-4": "DairunContainerCpuHigh",
  "ar-5": "DairunHostMemoryHigh",
  "ar-6": "DairunHostDiskLow",
  "ar-7": "DairunContainerRestarted",
  "ar-13": "DairunP95LatencyHigh",
  "ar-14": "DairunTelemetryMissing",
};

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.id === tabParam) ? (tabParam as string) : "incidents";

  const incidents = getIncidents();
  const mockAlertRules = getAlertRules();
  const notificationPolicies = getNotificationPolicies();
  const [liveAlertStates, liveAlertmanager] = await Promise.all([getLiveAlertRuleStates(), getLiveAlertmanagerStatus()]);

  const alertRules = mockAlertRules.map((r) => {
    const realName = REAL_ALERT_MAP[r.id];
    const real = realName ? liveAlertStates?.get(realName) : undefined;
    if (!real) return { ...r, isLive: false as const, realState: null as string | null };
    return { ...r, firingNow: real.state !== "inactive", isLive: true as const, realState: real.state };
  });
  const liveMappedCount = alertRules.filter((r) => r.isLive).length;
  const firingCount = alertRules.filter((r) => r.firingNow).length;

  return (
    <>
      <Topbar title="Incidents & Alerts" subtitle="이상징후 · 알림 규칙 · 알림 정책" />
      <main className="flex-1 space-y-5 p-4 md:p-6">
        <Tabs tabs={TABS} active={tab} basePath="/incidents" />

        {tab === "incidents" && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {incidents.length}건 진행 중 · Critical {incidents.filter((i) => i.severity === "critical").length}건
            </p>
            {incidents.length === 0 ? (
              <Card>
                <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  현재 감지된 이상징후가 없습니다.
                </p>
              </Card>
            ) : (
              incidents.map((inc) => <IncidentCard key={inc.id} incident={inc} />)
            )}
          </div>
        )}

        {tab === "alerts" && (
          <Card
            title="Alert Rules"
            subtitle={`${alertRules.length}개 규칙 · 현재 ${firingCount}개 발화 중${liveMappedCount > 0 ? ` · Stage 1(정적 임계치) ${liveMappedCount}개 실측` : ""}`}
            action={liveMappedCount > 0 && <LiveBadge label={`Prometheus 규칙 평가 · LIVE (${liveMappedCount}/${alertRules.length})`} />}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                    <th className="px-3 py-2 font-medium">분류</th>
                    <th className="px-3 py-2 font-medium">규칙</th>
                    <th className="px-3 py-2 font-medium">조건</th>
                    <th className="px-3 py-2 font-medium">심각도</th>
                    <th className="px-3 py-2 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {alertRules.map((r) => (
                    <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                        {r.category}
                      </td>
                      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
                        {r.name}
                        {r.isLive && (
                          <span
                            className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ color: "var(--series-3)", background: "color-mix(in oklab, var(--series-3) 16%, transparent)" }}
                          >
                            LIVE
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                        {r.condition}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-medium" style={{ color: SEVERITY_META[r.severity].color }}>
                          {SEVERITY_META[r.severity].label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.firingNow ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ color: "var(--status-critical)", background: "color-mix(in oklab, var(--status-critical) 14%, transparent)" }}
                          >
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--status-critical)" }} />
                            {r.isLive ? r.realState : "발화 중"}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            정상
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!liveAlertStates && (
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Prometheus에 연결할 수 없어 전체 규칙이 시뮬레이션 값으로 표시되고 있습니다.
              </p>
            )}
          </Card>
        )}

        {tab === "notifications" && (
          <div className="space-y-4">
            <Card
              title="Alertmanager 연동 상태"
              subtitle={liveAlertmanager?.connected ? `Prometheus → ${liveAlertmanager.url} → Slack` : "Prometheus에서 Alertmanager를 찾지 못했습니다"}
              action={liveAlertmanager && <LiveBadge label={liveAlertmanager.connected ? "연결됨 · LIVE" : "연결 안됨"} />}
            >
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {liveAlertmanager?.connected
                  ? "Critical은 15분마다, Warning은 2시간마다 재알림되며 같은 Slack 채널로 전달됩니다 (monitoring/alertmanager/alertmanager.yml)."
                  : "Alertmanager 컨테이너 상태와 monitoring/prometheus/prometheus.yml의 alerting.alertmanagers 설정을 확인하세요."}
              </p>
            </Card>

            <Card title="Notification Policy" subtitle="심각도별 전달 채널과 담당·재알림 주기">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                    <th className="px-3 py-2 font-medium">심각도</th>
                    <th className="px-3 py-2 font-medium">조건</th>
                    <th className="px-3 py-2 font-medium">전달 채널</th>
                    <th className="px-3 py-2 font-medium">담당</th>
                    <th className="px-3 py-2 text-right font-medium">재알림</th>
                  </tr>
                </thead>
                <tbody>
                  {notificationPolicies.map((p) => (
                    <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2.5">
                        <span
                          className="text-xs font-medium"
                          style={{
                            color:
                              p.severity === "Critical"
                                ? "var(--status-critical)"
                                : p.severity === "High"
                                  ? "var(--status-serious)"
                                  : p.severity === "Warning"
                                    ? "var(--status-warning)"
                                    : "var(--text-muted)",
                          }}
                        >
                          {p.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                        {p.condition}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: "var(--text-primary)" }}>
                        {p.channel}
                      </td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                        {p.owner}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular text-xs" style={{ color: "var(--text-secondary)" }}>
                        {p.resendMinutes ? `${p.resendMinutes}분마다` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
              동일 Incident에 대한 중복 알림은 재알림 주기 내에서 하나로 묶여 전달됩니다.
            </p>
            </Card>
          </div>
        )}
      </main>
    </>
  );
}
