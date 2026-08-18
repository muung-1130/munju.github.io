function severityColor(pct: number, warnAt: number, criticalAt: number) {
  if (pct >= criticalAt) return "var(--status-critical)";
  if (pct >= warnAt) return "var(--status-warning)";
  return "var(--status-good)";
}

function severityWord(pct: number, warnAt: number, criticalAt: number) {
  if (pct >= criticalAt) return "심각";
  if (pct >= warnAt) return "주의";
  return "정상";
}

export function Meter({
  label,
  pct,
  warnAt = 70,
  criticalAt = 90,
  detail,
}: {
  label: string;
  pct: number;
  warnAt?: number;
  criticalAt?: number;
  detail?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = severityColor(clamped, warnAt, criticalAt);
  const word = severityWord(clamped, warnAt, criticalAt);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span className="tabular font-medium" style={{ color }}>
          {word} · {clamped.toFixed(0)}%
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: "color-mix(in oklab, var(--series-1) 12%, var(--surface-1))" }}
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
      {detail && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {detail}
        </p>
      )}
    </div>
  );
}
