import Link from "next/link";
import type { ServiceSummary } from "@/lib/types";
import { StatusBadge, statusColor } from "@/components/ui/StatusBadge";
import { Sparkline } from "@/components/charts/Sparkline";

export function ServiceHealthGrid({ services }: { services: ServiceSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
            <th className="px-3 py-2 font-medium">서비스</th>
            <th className="px-3 py-2 font-medium">상태</th>
            <th className="px-3 py-2 text-right font-medium">RPS</th>
            <th className="px-3 py-2 text-right font-medium">p95</th>
            <th className="px-3 py-2 text-right font-medium">오류율</th>
            <th className="px-3 py-2 text-right font-medium">이상 점수</th>
            <th className="px-3 py-2 text-right font-medium">Pod</th>
            <th className="px-3 py-2 font-medium">추이</th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="px-3 py-2.5">
                <Link href={`/services/${s.id}`} className="font-medium hover:underline" style={{ color: "var(--text-primary)" }}>
                  {s.label}
                </Link>
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge status={s.status} />
              </td>
              <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                {s.rps.toFixed(1)}
              </td>
              <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                {Math.round(s.p95Ms)}ms
              </td>
              <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                {s.errorRatioPct.toFixed(2)}%
              </td>
              <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                {(s.anomalyScore * 100).toFixed(0)}
              </td>
              <td className="px-3 py-2.5 text-right tabular" style={{ color: "var(--text-primary)" }}>
                {s.currentReplicas}
                {s.recommendedReplicas !== s.currentReplicas && (
                  <span style={{ color: "var(--series-1)" }}> → {s.recommendedReplicas}</span>
                )}
              </td>
              <td className="px-3 py-2.5">
                <Sparkline values={s.sparkline} accent={statusColor(s.status)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
