"use client";

import { useMemo, useState } from "react";
import { niceTicks } from "@/lib/format";

export type BarSeriesDef = { id: string; label: string; color: string };
export type BarCategory = { id: string; label: string; values: Record<string, number> };

export function BarChart({
  categories,
  series,
  height,
  unit = "",
  decimals,
  colorOverrides,
}: {
  categories: BarCategory[];
  series: BarSeriesDef[];
  height?: number;
  unit?: string;
  /** Fixed decimal places for value labels; omit for auto (integers stay whole, others get 1dp). */
  decimals?: number;
  /** Optional per-category color override (e.g. status severity), keyed by category id — only applied when series.length === 1 */
  colorOverrides?: Record<string, string>;
}) {
  const fmt = (v: number) => (decimals !== undefined ? v.toFixed(decimals) : Number.isInteger(v) ? `${v}` : v.toFixed(1));
  const [hover, setHover] = useState<{ cat: string; series: string } | null>(null);

  const rowH = 26;
  const barThickness = Math.min(16, Math.floor((rowH - 6) / series.length));
  const groupGap = 14;
  const rowBlockH = barThickness * series.length + 2 * (series.length - 1) + groupGap;
  const W = 640;
  const padLeft = 172;
  const padRight = 54;
  const padTop = 8;
  const plotW = W - padLeft - padRight;
  const H = height ?? padTop + rowBlockH * categories.length + 8;

  const max = useMemo(() => {
    let m = 0;
    for (const c of categories) for (const s of series) m = Math.max(m, c.values[s.id] ?? 0);
    const ticks = niceTicks(0, m * 1.15 || 1, 3);
    return ticks[ticks.length - 1];
  }, [categories, series]);

  const xPos = (v: number) => padLeft + (v / (max || 1)) * plotW;

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: H }}>
          <line x1={padLeft} x2={padLeft} y1={0} y2={H} stroke="var(--baseline)" strokeWidth={1} />
          {categories.map((c, ci) => {
            const groupTop = padTop + ci * rowBlockH;
            return (
              <g key={c.id}>
                <text x={padLeft - 10} y={groupTop + rowBlockH / 2 - groupGap / 2} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--text-secondary)">
                  {c.label}
                </text>
                {series.map((s, si) => {
                  const v = c.values[s.id] ?? 0;
                  const y = groupTop + si * (barThickness + 2);
                  const w = Math.max(0, xPos(v) - padLeft);
                  const color = series.length === 1 ? colorOverrides?.[c.id] ?? s.color : s.color;
                  const isHovered = hover?.cat === c.id && hover?.series === s.id;
                  const labelFits = w > 26;
                  return (
                    <g key={s.id}>
                      <rect
                        x={padLeft}
                        y={y}
                        width={Math.max(2, w)}
                        height={barThickness}
                        rx={4}
                        fill={color}
                        opacity={isHovered ? 0.85 : 1}
                      />
                      <text
                        x={labelFits ? padLeft + w - 6 : padLeft + w + 6}
                        y={y + barThickness / 2}
                        textAnchor={labelFits ? "end" : "start"}
                        dominantBaseline="middle"
                        fontSize={10}
                        fontWeight={600}
                        fill={labelFits ? "#ffffff" : "var(--text-primary)"}
                      >
                        {fmt(v)}
                        {unit}
                      </text>
                      <rect
                        x={padLeft}
                        y={y}
                        width={plotW}
                        height={barThickness}
                        fill="transparent"
                        onPointerEnter={() => setHover({ cat: c.id, series: s.id })}
                        onPointerLeave={() => setHover(null)}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
