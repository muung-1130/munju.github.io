/**
 * Semicircular status gauge (red→yellow→green arc + needle), in the style of
 * a "Fear & Greed Index" widget. The number + label are the primary,
 * text-first signal — the arc is a supplementary visual, never the only
 * carrier of meaning (dataviz: never color-alone).
 */
export function Gauge({ value, label, size = 160 }: { value: number; label: string; size?: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 12;

  const point = (pct: number, r: number) => {
    const deg = 180 - (pct / 100) * 180;
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)] as const;
  };

  const arc = (startPct: number, endPct: number) => {
    const [x1, y1] = point(startPct, radius);
    const [x2, y2] = point(endPct, radius);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  };

  const needleLen = radius - 16;
  const [nx, ny] = point(clamped, needleLen);

  return (
    <svg width={size} height={size / 2 + 34} viewBox={`0 0 ${size} ${size / 2 + 34}`} role="img" aria-label={`${label}: ${Math.round(clamped)}`}>
      <path d={arc(0, 33.3)} fill="none" stroke="var(--status-critical)" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d={arc(34, 66)} fill="none" stroke="var(--status-warning)" strokeWidth={strokeWidth} />
      <path d={arc(66.7, 100)} fill="none" stroke="var(--status-good)" strokeWidth={strokeWidth} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text-primary)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill="var(--text-primary)" />
      <text x={cx} y={cy - 10} textAnchor="middle" fontSize={size * 0.19} fontWeight={700} fill="var(--text-primary)">
        {Math.round(clamped)}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={12} fill="var(--text-muted)">
        {label}
      </text>
    </svg>
  );
}
