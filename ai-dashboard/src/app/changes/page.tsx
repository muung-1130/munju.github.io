import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { formatTimeAgo } from "@/lib/format";
import { getChangeEvents } from "@/lib/mock";
import type { ChangeEvent } from "@/lib/types";

const TYPE_META: Record<ChangeEvent["type"], { label: string; color: string }> = {
  deploy: { label: "배포", color: "var(--series-1)" },
  config: { label: "설정 변경", color: "var(--series-3)" },
  secret: { label: "Secret", color: "var(--series-7)" },
  network_policy: { label: "NetworkPolicy", color: "var(--series-2)" },
  scale: { label: "Scale 설정", color: "var(--series-4)" },
  alert_rule: { label: "Alert Rule", color: "var(--series-5)" },
};

export default function ChangesPage() {
  const changes = getChangeEvents();

  return (
    <>
      <Topbar title="Changes" subtitle="배포 · 설정 변경과 장애 상관관계 타임라인" />
      <main className="flex-1 space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
          {Object.entries(TYPE_META).map(([key, meta]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: meta.color }} />
              {meta.label}
            </span>
          ))}
        </div>

        <div className="space-y-3">
          {changes.map((c) => {
            const meta = TYPE_META[c.type];
            const p95Delta = c.p95AfterMs - c.p95BeforeMs;
            const errorDelta = Math.round((c.errorAfterPct - c.errorBeforePct) * 100) / 100;
            const successDelta = Math.round((c.successRatioAfterPct - c.successRatioBeforePct) * 100) / 100;
            const regressed = errorDelta > 1 || p95Delta > 300;

            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ color: meta.color, background: `color-mix(in oklab, ${meta.color} 14%, transparent)` }}
                    >
                      {meta.label}
                    </span>
                    <Link href={`/services/${c.service}`} className="text-sm font-semibold hover:underline" style={{ color: "var(--text-primary)" }}>
                      {c.serviceLabel}
                    </Link>
                    <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                      {c.resource}
                    </span>
                  </div>
                  <span className="shrink-0 tabular text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatTimeAgo(c.minutesAgo)}
                  </span>
                </div>

                <p className="mt-2 text-sm" style={{ color: "var(--text-primary)" }}>
                  {c.summary}
                </p>

                <div className="mt-3 grid grid-cols-3 gap-3 border-t pt-3 text-xs tabular" style={{ borderColor: "var(--border)" }}>
                  <div>
                    <p style={{ color: "var(--text-muted)" }}>성공률</p>
                    <p className="mt-0.5" style={{ color: "var(--text-primary)" }}>
                      {c.successRatioBeforePct}% → {c.successRatioAfterPct}%
                      <span style={{ color: successDelta < 0 ? "var(--status-critical)" : "var(--success-text)" }}> ({successDelta >= 0 ? "+" : ""}{successDelta}p)</span>
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "var(--text-muted)" }}>p95</p>
                    <p className="mt-0.5" style={{ color: "var(--text-primary)" }}>
                      {c.p95BeforeMs}ms → {c.p95AfterMs}ms
                      <span style={{ color: p95Delta > 0 ? "var(--status-critical)" : "var(--success-text)" }}> ({p95Delta >= 0 ? "+" : ""}{p95Delta}ms)</span>
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "var(--text-muted)" }}>오류율</p>
                    <p className="mt-0.5" style={{ color: "var(--text-primary)" }}>
                      {c.errorBeforePct}% → {c.errorAfterPct}%
                      <span style={{ color: errorDelta > 0 ? "var(--status-critical)" : "var(--success-text)" }}> ({errorDelta >= 0 ? "+" : ""}{errorDelta}p)</span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    {regressed && (
                      <span className="font-medium" style={{ color: "var(--status-critical)" }}>
                        ⚠ 변경 직후 지표 악화 감지
                      </span>
                    )}
                    {c.relatedIncidentId && (
                      <Link href="/incidents" className="font-medium hover:underline" style={{ color: "var(--series-1)" }}>
                        관련 Incident {c.relatedIncidentId} →
                      </Link>
                    )}
                  </div>
                  <span style={{ color: c.rollbackable ? "var(--text-secondary)" : "var(--text-muted)" }}>
                    {c.rollbackable ? "Rollback 가능" : "Rollback 대상 아님"}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      </main>
    </>
  );
}
