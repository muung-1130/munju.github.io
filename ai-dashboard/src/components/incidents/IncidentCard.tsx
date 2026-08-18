import Link from "next/link";
import type { Incident } from "@/lib/types";
import { formatTimeAgo } from "@/lib/format";
import { NOW } from "@/lib/mock";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function IncidentCard({ incident, variant = "full" }: { incident: Incident; variant?: "full" | "compact" }) {
  const minutesAgo = Math.round((NOW - new Date(incident.createdAt).getTime()) / 60000);
  const severityStatus = incident.severity === "critical" ? "critical" : "warning";

  if (variant === "compact") {
    return (
      <div className="rounded-xl border p-4" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusBadge status={severityStatus} />
            <Link href={`/services/${incident.service}`} className="text-sm font-semibold hover:underline" style={{ color: "var(--text-primary)" }}>
              {incident.serviceLabel}
            </Link>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {formatTimeAgo(minutesAgo)}
            </span>
          </div>
          <Link href="/incidents" className="text-xs font-medium hover:underline" style={{ color: "var(--series-1)" }}>
            자세히 보기 →
          </Link>
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--text-primary)" }}>
          {incident.headline}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular" style={{ color: "var(--text-muted)" }}>
          <span>영향 사용자 ~{incident.affectedUsers?.toLocaleString()}명</span>
          <span>담당 {incident.owner}</span>
          <span>신뢰도 {(incident.confidence * 100).toFixed(0)}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <StatusBadge status={severityStatus} />
            <Link href={`/services/${incident.service}`} className="text-sm font-semibold hover:underline" style={{ color: "var(--text-primary)" }}>
              {incident.serviceLabel}
            </Link>
          </div>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {incident.id} · {formatTimeAgo(minutesAgo)} · 담당 {incident.owner} · 영향 사용자 ~{incident.affectedUsers?.toLocaleString()}명
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ color: "var(--text-secondary)", background: "var(--surface-page)" }}
        >
          {incident.status === "active" ? "미확인" : incident.status === "investigating" ? "조치 중" : "해결됨"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
        {incident.headline}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            ② 어떤 근거로 탐지했는가
          </p>
          <ul className="space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            {incident.reasons.map((r, i) => (
              <li key={i} className="flex gap-1.5">
                <span style={{ color: "var(--text-muted)" }}>{i + 1}.</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            ④ 무엇을 해야 하는가
          </p>
          <ul className="space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            {incident.recommendedActions.map((r, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden style={{ color: "var(--series-1)" }}>
                  →
                </span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          ③ AI 신뢰도에 반대되는 근거 (이상 점수 {(incident.anomalyScore * 100).toFixed(0)} · 신뢰도 {(incident.confidence * 100).toFixed(0)}%)
        </p>
        <ul className="space-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {incident.counterEvidence.map((r, i) => (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden>⚠</span>
              {r}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--surface-page)", color: "var(--text-secondary)" }}>
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
          예상 회복 효과:{" "}
        </span>
        {incident.expectedRecoveryEffect}
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs tabular" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        <span>RPS {incident.currentRps} (예상 {incident.expectedRps})</span>
        <span>p95 {incident.p95Ms}ms</span>
        <span>오류율 {incident.errorRatioPct}%</span>
        {incident.dbPoolUsagePct !== null && <span>DB Pool {incident.dbPoolUsagePct}%</span>}
        <span>
          Pod {incident.currentReplicas} → {incident.recommendedReplicas}
        </span>
      </div>
    </div>
  );
}
