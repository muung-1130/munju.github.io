import { Sparkline } from "@/components/charts/Sparkline";

export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaGood,
  trend,
  accent = "var(--series-1)",
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  deltaGood?: boolean | "neutral";
  trend?: number[];
  accent?: string;
}) {
  const deltaColor = deltaGood === "neutral" ? "var(--text-muted)" : deltaGood ? "var(--status-good)" : "var(--status-critical)";

  return (
    <div className="rounded-2xl border p-4" style={{ background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {label}
          </p>
          <p className="mt-1.5 tabular" style={{ color: "var(--text-primary)" }}>
            <span className="text-2xl font-semibold">{value}</span>
            {unit && (
              <span className="ml-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                {unit}
              </span>
            )}
          </p>
          {delta && (
            <span
              className="mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium tabular"
              style={{ color: deltaColor, background: deltaGood === "neutral" ? "var(--surface-page)" : `color-mix(in oklab, ${deltaColor} 14%, transparent)` }}
            >
              {deltaGood === true && "↗"}
              {deltaGood === false && "↘"}
              {delta}
            </span>
          )}
        </div>
        {trend && trend.length > 1 && (
          <div className="shrink-0 pt-1">
            <Sparkline values={trend} accent={accent} />
          </div>
        )}
      </div>
    </div>
  );
}
