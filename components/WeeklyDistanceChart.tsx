import type { DailyDistancePoint } from '@/lib/runningRecord';
import { LineTrendChart } from './LineTrendChart';

export function WeeklyDistanceChart({ data }: { data: DailyDistancePoint[] }) {
  if (data.length === 0) return null;

  return (
    <LineTrendChart
      points={data.map((d) => ({ label: d.dayLabel, value: d.distanceKm, highlighted: d.isToday }))}
      ariaLabel="이번 주 요일별 러닝 거리 그래프"
      formatValue={(v) => `${v.toFixed(1)}km`}
    />
  );
}
