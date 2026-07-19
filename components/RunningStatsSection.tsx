'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/UI';

type StatBucket = { label: string; distanceKm: number; avgHeartRate: number | null; isCurrent: boolean };
type StatsResponse = { period: 'year' | 'month' | 'week'; buckets: StatBucket[]; hasAnyHeartRate: boolean };

const PERIOD_LABEL: Record<StatsResponse['period'], string> = { year: '올해', month: '이번달', week: '이번주' };

const CHART_WIDTH = 640;
const CHART_HEIGHT = 170;
const CHART_TOP = 24;
const CHART_BOTTOM = 128;

function StatsChart({ buckets }: { buckets: StatBucket[] }) {
  const gap = buckets.length > 7 ? 8 : 14;
  const maxKm = Math.max(...buckets.map((b) => b.distanceKm), 1);
  const barWidth = (CHART_WIDTH - gap * (buckets.length + 1)) / buckets.length;

  return (
    <svg className="mypage-stats-chart" width="100%" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="러닝 통계 그래프">
      <defs>
        <linearGradient id="statsBarFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2f6bff" />
          <stop offset="1" stopColor="#5ca2ff" />
        </linearGradient>
        <linearGradient id="statsBarFillCurrent" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ff8a3d" />
          <stop offset="1" stopColor="#ffb26b" />
        </linearGradient>
      </defs>
      <line x1="0" y1={CHART_BOTTOM} x2={CHART_WIDTH} y2={CHART_BOTTOM} stroke="#e2e8f2" strokeWidth="1" />
      {buckets.map((b, i) => {
        const barHeight = maxKm > 0 ? (b.distanceKm / maxKm) * (CHART_BOTTOM - CHART_TOP) : 0;
        const x = gap + i * (barWidth + gap);
        const y = CHART_BOTTOM - barHeight;
        return (
          <g key={b.label + i}>
            <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, 2)} rx="6" fill={b.isCurrent ? 'url(#statsBarFillCurrent)' : 'url(#statsBarFill)'} />
            {b.distanceKm > 0 && (
              <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" fontSize="11" fontWeight="800" fill="#0e2a54">
                {b.distanceKm.toFixed(1)}
              </text>
            )}
            <text
              x={x + barWidth / 2}
              y={CHART_BOTTOM + 18}
              textAnchor="middle"
              fontSize="11"
              fontWeight={b.isCurrent ? 900 : 700}
              fill={b.isCurrent ? '#ff8a3d' : '#64748b'}
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
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
