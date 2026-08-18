import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Sparkline } from "@/components/charts/Sparkline";
import { statusColor } from "@/components/ui/StatusBadge";
import { getServiceSummaries } from "@/lib/mock";

export default function ServicesIndexPage() {
  const services = getServiceSummaries();

  return (
    <>
      <Topbar title="Service MELT" subtitle="서비스를 선택하면 Metrics·Events·Logs·Traces·AI 근거를 한 화면에서 확인할 수 있습니다" />
      <main className="flex-1 p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <Link
              key={s.id}
              href={`/services/${s.id}`}
              className="rounded-xl border p-4 transition-colors hover:border-[var(--series-1)]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {s.id}
                  </p>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <div className="mt-3 flex items-end justify-between">
                <dl className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <dt style={{ color: "var(--text-muted)" }}>RPS</dt>
                    <dd className="tabular font-medium" style={{ color: "var(--text-primary)" }}>
                      {s.rps.toFixed(1)}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: "var(--text-muted)" }}>p95</dt>
                    <dd className="tabular font-medium" style={{ color: "var(--text-primary)" }}>
                      {Math.round(s.p95Ms)}ms
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: "var(--text-muted)" }}>오류율</dt>
                    <dd className="tabular font-medium" style={{ color: "var(--text-primary)" }}>
                      {s.errorRatioPct.toFixed(1)}%
                    </dd>
                  </div>
                </dl>
                <Sparkline values={s.sparkline} accent={statusColor(s.status)} />
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
