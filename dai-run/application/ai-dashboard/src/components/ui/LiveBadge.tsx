export function LiveBadge({ label = "LIVE · Prometheus" }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: "var(--series-3)", background: "color-mix(in oklab, var(--series-3) 16%, transparent)" }}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: "var(--series-3)" }} />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "var(--series-3)" }} />
      </span>
      {label}
    </span>
  );
}
