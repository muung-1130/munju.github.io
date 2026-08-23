'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, StatCard } from '@/components/UI';
import { WeeklyDistanceChart } from '@/components/WeeklyDistanceChart';
import type { DailyDistancePoint } from '@/lib/runningRecord';

// lib/runningRecord.ts는 pg Pool을 top-level에서 import하므로 클라이언트 컴포넌트에서 직접
// 가져다 쓰면 서버 전용 모듈이 번들에 섞인다 — 순수 포맷 함수만 그대로 옮겨 적었다.
function formatDuration(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPace(paceSecPerKm: number) {
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

type RunningSummary = {
  totalDistanceM: number;
  totalDurationSec: number;
  averagePaceSecPerKm: number | null;
  bestPaceSecPerKm: number | null;
  totalCalories: number;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  runCount: number;
};

type PersonalizedResponse =
  | { authenticated: false }
  | { authenticated: true; summary: RunningSummary | null; dailyDistances: DailyDistancePoint[] };

export function RunSummaryCard() {
  const [data, setData] = useState<PersonalizedResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/home/personalized', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: PersonalizedResponse | null) => {
        if (!cancelled) setData(json ?? { authenticated: false });
      })
      .catch(() => {
        if (!cancelled) setData({ authenticated: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = data && data.authenticated ? data.summary : null;
  const dailyDistances = data && data.authenticated ? data.dailyDistances : [];

  return (
    <Card className="run-summary-card">
      <div className="card-head">
        <h3>나의 러닝 요약</h3>
        <span className="muted">최근 4주</span>
      </div>
      {!data ? (
        <p className="muted">러닝 요약을 불러오는 중...</p>
      ) : summary ? (
        <>
          <div className="summary-stats summary-stats-lg">
            <StatCard label="거리" value={(summary.totalDistanceM / 1000).toFixed(1)} suffix="km" />
            <StatCard label="시간" value={formatDuration(summary.totalDurationSec)} />
            <StatCard
              label="평균 페이스"
              value={summary.averagePaceSecPerKm ? formatPace(summary.averagePaceSecPerKm) : '-'}
              suffix="/km"
            />
            <StatCard
              label="최고 페이스"
              value={summary.bestPaceSecPerKm ? formatPace(summary.bestPaceSecPerKm) : '-'}
              suffix="/km"
            />
            <StatCard label="평균 심박수" value={summary.averageHeartRate ? String(summary.averageHeartRate) : '-'} suffix="bpm" />
            <StatCard label="최고 심박수" value={summary.maxHeartRate ? String(summary.maxHeartRate) : '-'} suffix="bpm" />
            <StatCard label="칼로리" value={summary.totalCalories.toLocaleString()} suffix="kcal" />
          </div>
          <WeeklyDistanceChart data={dailyDistances} />
          <p className="muted">최근 {summary.runCount}회 러닝 기록 기준</p>
        </>
      ) : (
        <p className="muted">최근 4주 동안의 러닝 기록이 아직 없어요.</p>
      )}
      <Link href="/mypage#running-records" className="ghost-btn">
        상세 기록 보기
      </Link>
    </Card>
  );
}
