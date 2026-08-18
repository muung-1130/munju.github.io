"use client";

import { useId, useMemo, useState } from "react";
import { niceTicks } from "@/lib/format";

export type ChartSeriesDef = {
  id: string;
  label: string;
  color: string;
};

export type ChartPoint = { t: number } & Record<string, number | undefined>;

export function LineChart({
  series,
  data,
  height = 220,
  unit = "",
  decimals,
  referenceLine,
  showArea,
  yMinZero = true,
}: {
  series: ChartSeriesDef[];
  data: ChartPoint[];
  height?: number;
  unit?: string;
  /** Fixed decimal places for value labels/tooltips; omit for auto (integers stay whole, others get 1dp). */
  decimals?: number;
  referenceLine?: { value: number; label: string };
  showArea?: boolean;
  yMinZero?: boolean;
}) {
  const uid = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const fmt = (v: number) => (decimals !== undefined ? v.toFixed(decimals) : Number.isInteger(v) ? `${v}` : v.toFixed(1));
  const xFmt = (t: number) => (t === 0 ? "지금" : `${t}m`);

  const W = 720;
  const padLeft = 44;
  const padRight = series.length === 1 ? 68 : 12;
  const padTop = 14;
  const padBottom = 24;
  const plotW = W - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const { yMin, yMax, ticks } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of data) {
      for (const s of series) {
        const v = p[s.id];
        if (typeof v === "number") {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
    }
    if (referenceLine) hi = Math.max(hi, referenceLine.value);
    if (yMinZero) lo = 0;
    if (!Number.isFinite(lo)) lo = 0;
    if (!Number.isFinite(hi) || hi === lo) hi = lo + 1;
    const t = niceTicks(lo, hi * 1.12, 4);
    return { yMin: t[0], yMax: t[t.length - 1], ticks: t };
  }, [data, series, referenceLine, yMinZero]);

  const xMin = data[0]?.t ?? 0;
  const xMax = data[data.length - 1]?.t ?? 1;

  const xPos = (t: number) => padLeft + ((t - xMin) / (xMax - xMin || 1)) * plotW;
  const yPos = (v: number) => padTop + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const linePaths = series.map((s) => {
    let d = "";
    let drawing = false;
    for (const p of data) {
      const v = p[s.id];
      if (typeof v !== "number") {
        drawing = false;
        continue;
      }
      d += `${drawing ? "L" : "M"}${xPos(p.t).toFixed(1)},${yPos(v).toFixed(1)} `;
      drawing = true;
    }
    return { id: s.id, d: d.trim() };
  });

  const lastDefined = (seriesId: string) => {
    for (let i = data.length - 1; i >= 0; i--) {
      const v = data[i][seriesId];
      if (typeof v === "number") return data[i];
    }
    return null;
  };

  const areaPath =
    showArea && series.length === 1 && linePaths[0].d
      ? `${linePaths[0].d} L${xPos(xMax).toFixed(1)},${yPos(yMin).toFixed(1)} L${xPos(xMin).toFixed(1)},${yPos(yMin).toFixed(1)} Z`
      : null;

  const xTickIdxs = useMemo(() => {
    if (data.length <= 1) return [0];
    const n = Math.min(5, data.length);
    return Array.from({ length: n }, (_, i) => Math.round((i * (data.length - 1)) / (n - 1)));
  }, [data.length]);

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(fraction * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
  }

  const hovered = hoverIdx !== null ? data[hoverIdx] : null;
  const hoverXPct = hovered ? ((xPos(hovered.t) - padLeft) / plotW) * 100 : 0;

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height }}
          role="img"
          aria-label={series.map((s) => s.label).join(", ")}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={W - padRight}
                y1={yPos(tick)}
                y2={yPos(tick)}
                stroke="var(--gridline)"
                strokeWidth={1}
              />
              <text x={padLeft - 8} y={yPos(tick)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--text-muted)">
                {fmt(tick)}
              </text>
            </g>
          ))}
          <line x1={padLeft} x2={padLeft} y1={padTop} y2={padTop + plotH} stroke="var(--baseline)" strokeWidth={1} />
          <line x1={padLeft} x2={W - padRight} y1={padTop + plotH} y2={padTop + plotH} stroke="var(--baseline)" strokeWidth={1} />

          {xTickIdxs.map((idx) => (
            <text key={idx} x={xPos(data[idx].t)} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
              {xFmt(data[idx].t)}
            </text>
          ))}

          {referenceLine && (
            <g>
              <line
                x1={padLeft}
                x2={W - padRight}
                y1={yPos(referenceLine.value)}
                y2={yPos(referenceLine.value)}
                stroke="var(--status-warning)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text x={W - padRight} y={yPos(referenceLine.value) - 4} textAnchor="end" fontSize={9.5} fill="var(--status-warning)">
                {referenceLine.label}
              </text>
            </g>
          )}

          {areaPath && <path d={areaPath} fill={series[0].color} opacity={0.1} stroke="none" />}

          {linePaths.map((lp, i) => (
            <path key={lp.id} d={lp.d} fill="none" stroke={series[i].color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {series.map((s) => {
            const last = lastDefined(s.id);
            if (!last) return null;
            return (
              <circle
                key={s.id}
                cx={xPos(last.t)}
                cy={yPos(last[s.id] as number)}
                r={4}
                fill={s.color}
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            );
          })}

          {series.length === 1 &&
            (() => {
              const last = lastDefined(series[0].id);
              if (!last) return null;
              return (
                <text
                  x={xPos(last.t) + 8}
                  y={yPos(last[series[0].id] as number)}
                  dominantBaseline="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--text-primary)"
                >
                  {fmt(last[series[0].id] as number)}
                  {unit}
                </text>
              );
            })()}

          {hovered && (
            <line x1={xPos(hovered.t)} x2={xPos(hovered.t)} y1={padTop} y2={padTop + plotH} stroke="var(--text-muted)" strokeWidth={1} />
          )}
          {hovered &&
            series.map((s) => {
              const v = hovered[s.id];
              if (typeof v !== "number") return null;
              return (
                <circle
                  key={s.id}
                  cx={xPos(hovered.t)}
                  cy={yPos(v)}
                  r={4}
                  fill={s.color}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              );
            })}

          <rect
            x={padLeft}
            y={padTop}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverIdx(null)}
            style={{ cursor: "crosshair" }}
          />
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-32 rounded-lg border px-2.5 py-2 text-xs shadow-md"
            style={{
              left: `${hoverXPct}%`,
              transform: hoverXPct > 65 ? "translateX(-105%)" : "translateX(8px)",
              background: "var(--surface-raised)",
              borderColor: "var(--border)",
            }}
          >
            <p className="mb-1 font-medium tabular" style={{ color: "var(--text-secondary)" }}>
              {xFmt(hovered.t)}
            </p>
            {series.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                  <span className="inline-block h-0.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="tabular font-semibold" style={{ color: "var(--text-primary)" }}>
                  {typeof hovered[s.id] === "number" ? `${fmt(hovered[s.id] as number)}${unit}` : "–"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        className="mt-1 text-xs underline decoration-dotted underline-offset-2"
        style={{ color: "var(--text-muted)" }}
      >
        {showTable ? "표 숨기기" : "표로 보기"}
      </button>

      {showTable && (
        <div className="mt-2 max-h-48 overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-xs tabular">
            <thead className="sticky top-0" style={{ background: "var(--surface-1)" }}>
              <tr>
                <th className="px-2 py-1.5 text-left font-medium" style={{ color: "var(--text-secondary)" }}>
                  시간
                </th>
                {series.map((s) => (
                  <th key={s.id} className="px-2 py-1.5 text-right font-medium" style={{ color: "var(--text-secondary)" }}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((p, i) => (
                <tr key={`${uid}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 py-1" style={{ color: "var(--text-secondary)" }}>
                    {xFmt(p.t)}
                  </td>
                  {series.map((s) => (
                    <td key={s.id} className="px-2 py-1 text-right" style={{ color: "var(--text-primary)" }}>
                      {typeof p[s.id] === "number" ? `${fmt(p[s.id] as number)}${unit}` : "–"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
