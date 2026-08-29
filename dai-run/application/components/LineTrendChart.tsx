export type TrendPoint = { label: string; value: number; highlighted?: boolean };

const CHART_WIDTH = 640;
const PAD_X = 24;
const TOP_PAD = 22;
const BOTTOM_LABEL_PAD = 40;

export function LineTrendChart({
  points,
  ariaLabel,
  height = 150,
  formatValue
}: {
  points: TrendPoint[];
  ariaLabel: string;
  height?: number;
  formatValue?: (value: number) => string;
}) {
  if (points.length === 0) return null;

  const bottom = height - BOTTOM_LABEL_PAD;
  const maxValue = Math.max(...points.map((p) => p.value), 1);
  const step = points.length > 1 ? (CHART_WIDTH - PAD_X * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    ...p,
    x: points.length > 1 ? PAD_X + i * step : CHART_WIDTH / 2,
    y: bottom - (p.value / maxValue) * (bottom - TOP_PAD)
  }));
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${bottom} L ${coords[0].x} ${bottom} Z`;
  const format = formatValue ?? ((v: number) => v.toFixed(1));

  return (
    <svg className="line-trend-chart" width="100%" viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id="lineTrendArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#74BDEB" stopOpacity="0.22" />
          <stop offset="1" stopColor="#74BDEB" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1={bottom} x2={CHART_WIDTH} y2={bottom} stroke="#CFE9FF" strokeWidth="1" />
      <path d={areaPath} fill="url(#lineTrendArea)" />
      <path d={linePath} fill="none" stroke="#74BDEB" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((c, i) => (
        <g key={c.label + i}>
          <circle cx={c.x} cy={c.y} r={c.highlighted ? 5 : 4} fill={c.highlighted ? '#ff8a3d' : '#74BDEB'} stroke="#fff" strokeWidth="1.5" />
          {c.value > 0 && (
            <text x={c.x} y={c.y - 10} textAnchor="middle" fontSize="11" fontWeight="800" fill="#3C6E71">
              {format(c.value)}
            </text>
          )}
          <text
            x={c.x}
            y={bottom + 18}
            textAnchor="middle"
            fontSize="11"
            fontWeight={c.highlighted ? 900 : 700}
            fill={c.highlighted ? '#ff8a3d' : 'rgba(0,0,0,.55)'}
          >
            {c.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
