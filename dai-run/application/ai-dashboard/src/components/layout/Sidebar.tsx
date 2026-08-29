"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SERVICES, getIncidents } from "@/lib/mock";

const NAV = [
  { href: "/", label: "Overview", icon: "◧" },
  { href: "/incidents", label: "Incidents & Alerts", icon: "⚠" },
  { href: "/services", label: "Services", icon: "▣" },
  { href: "/insights", label: "AI Insights", icon: "✦" },
  { href: "/autoscaling", label: "Predictive Autoscaling", icon: "⇧" },
  { href: "/infrastructure", label: "Infrastructure", icon: "▤" },
  { href: "/changes", label: "Changes", icon: "↻" },
];

export function Sidebar() {
  const pathname = usePathname();
  const incidentCount = getIncidents().length;

  return (
    <aside
      className="hidden w-64 shrink-0 flex-col px-3 py-4 md:flex"
      style={{ background: "var(--surface-1)", boxShadow: "1px 0 0 var(--border)" }}
    >
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
          style={{ background: "var(--brand)" }}
          aria-hidden
        >
          D
        </span>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            DAI RUN
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            AI Observability
          </p>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors"
              style={{
                color: active ? "var(--brand)" : "var(--text-secondary)",
                background: active ? "var(--brand-bg)" : "transparent",
              }}
            >
              <span aria-hidden style={{ color: active ? "var(--brand)" : "var(--text-muted)" }}>
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.href === "/incidents" && incidentCount > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular"
                  style={{ color: "var(--status-critical)", background: "color-mix(in oklab, var(--status-critical) 16%, transparent)" }}
                >
                  {incidentCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <p className="mb-1.5 mt-6 px-2.5 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Service MELT
      </p>
      <nav className="flex flex-col gap-0.5 overflow-y-auto">
        {SERVICES.map((s) => {
          const href = `/services/${s.id}`;
          const active = pathname === href;
          return (
            <Link
              key={s.id}
              href={href}
              className="truncate rounded-xl px-2.5 py-1.5 text-sm transition-colors"
              style={{
                color: active ? "var(--brand)" : "var(--text-secondary)",
                background: active ? "var(--brand-bg)" : "transparent",
              }}
              title={s.label}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
