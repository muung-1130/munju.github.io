import type { DailyDistancePoint } from '@/lib/runningRecord';

const CHART_WIDTH = 420;
const CHART_HEIGHT = 150;
const CHART_TOP = 24;
const CHART_BOTTOM = 112;
const BAR_GAP = 14;

export function WeeklyDistanceChart({ data }: { data: DailyDistancePoint[] }) {
  if (data.length === 0) return null;

  const maxKm = Math.max(...data.map((d) => d.distanceKm), 1);
  const barWidth = (CHART_WIDTH - BAR_GAP * (data.length + 1)) / data.length;

  return (
    <svg
      className="weekly-distance-chart"
      width="100%"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label="이번 주 요일별 러닝 거리 그래프"
    >
      <defs>
        <linearGradient id="weeklyBarFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2f6bff" />
          <stop offset="1" stopColor="#5ca2ff" />
        </linearGradient>
        <linearGradient id="weeklyBarFillToday" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ff8a3d" />
          <stop offset="1" stopColor="#ffb26b" />
        </linearGradient>
      </defs>
      <line x1="0" y1={CHART_BOTTOM} x2={CHART_WIDTH} y2={CHART_BOTTOM} stroke="#e2e8f2" strokeWidth="1" />
      {data.map((point, i) => {
        const barHeight = maxKm > 0 ? (point.distanceKm / maxKm) * (CHART_BOTTOM - CHART_TOP) : 0;
        const x = BAR_GAP + i * (barWidth + BAR_GAP);
        const y = CHART_BOTTOM - barHeight;
        return (
          <g key={point.dayLabel + i}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 2)}
              rx="7"
              fill={point.isToday ? 'url(#weeklyBarFillToday)' : 'url(#weeklyBarFill)'}
            />
            <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" fontSize="12" fontWeight="800" fill="#0e2a54">
              {point.distanceKm > 0 ? `${point.distanceKm.toFixed(1)}km` : ''}
            </text>
            <text
              x={x + barWidth / 2}
              y={CHART_BOTTOM + 20}
              textAnchor="middle"
              fontSize="12"
              fontWeight={point.isToday ? 900 : 700}
              fill={point.isToday ? '#ff8a3d' : '#64748b'}
            >
              {point.dayLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
