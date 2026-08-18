import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { RefreshControl } from "./RefreshControl";
import { SearchBar } from "./SearchBar";

const MOBILE_NAV = [
  { href: "/", label: "Overview" },
  { href: "/incidents", label: "Incidents" },
  { href: "/services", label: "Services" },
  { href: "/autoscaling", label: "Autoscaling" },
  { href: "/infrastructure", label: "Infra" },
  { href: "/changes", label: "Changes" },
];

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header style={{ background: "var(--surface-1)", boxShadow: "0 1px 0 var(--border)" }}>
      <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </p>
          )}
        </div>
        <SearchBar />
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline-block"
            style={{ color: "var(--series-3)", background: "color-mix(in oklab, var(--series-3) 14%, transparent)" }}
          >
            onprem · staging
          </span>
          <RefreshControl />
          <ThemeToggle />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t px-3 py-1.5 md:hidden" style={{ borderColor: "var(--border)" }}>
        {MOBILE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
