'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/UI';
import { LineTrendChart } from '@/components/LineTrendChart';

type StatBucket = { label: string; distanceKm: number; avgHeartRate: number | null; isCurrent: boolean };
type StatsResponse = { period: 'year' | 'month' | 'week'; buckets: StatBucket[]; hasAnyHeartRate: boolean };

const PERIOD_LABEL: Record<StatsResponse['period'], string> = { year: '올해', month: '이번달', week: '이번주' };

function StatsChart({ buckets }: { buckets: StatBucket[] }) {
  return (
    <LineTrendChart
      points={buckets.map((b) => ({ label: b.label, value: b.distanceKm, highlighted: b.isCurrent }))}
      ariaLabel="러닝 통계 그래프"
      height={120}
    />
  );
}

export function RunningStatsSection() {
  const [period, setPeriod] = useState<StatsResponse['period']>('week');
  const [data, setData] = useState<StatsResponse | null>(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/mypage/running-stats?period=${period}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setData);
  }, [period]);

  const averageHeartRate = (() => {
    if (!data) return null;
    const withHr = data.buckets.filter((b) => b.avgHeartRate !== null);
    if (withHr.length === 0) return null;
    return Math.round(withHr.reduce((sum, b) => sum + (b.avgHeartRate ?? 0), 0) / withHr.length);
  })();

  return (
    <Card className="mypage-stats-card">
      <div className="card-head">
        <h2>러닝 통계</h2>
        <div className="segmented">
          <button className={period === 'year' ? 'active' : ''} onClick={() => setPeriod('year')}>올해</button>
          <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>이번달</button>
          <button className={period === 'week' ? 'active' : ''} onClick={() => setPeriod('week')}>이번주</button>
        </div>
      </div>
      {!data ? (
        <p className="muted">불러오는 중...</p>
      ) : (
        <>
          <StatsChart buckets={data.buckets} />
          {data.hasAnyHeartRate ? (
            <p className="muted">{PERIOD_LABEL[data.period]} 평균 심박수: {averageHeartRate ?? '-'} bpm</p>
          ) : (
            <p className="muted">심박수 기록이 아직 없어요.</p>
          )}
        </>
      )}
    </Card>
  );
}
