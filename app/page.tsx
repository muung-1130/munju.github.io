import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { Card, StatCard } from '@/components/UI';
import { FeatureBanner } from '@/components/FeatureBanner';
import { AiRecoPanel } from '@/components/AiRecoPanel';
import { LocationPermissionButton } from '@/components/LocationPermissionButton';
import { HomeGreeting } from '@/components/HomeGreeting';
import { WeatherPanel } from '@/components/WeatherPanel';
import { WeeklyDistanceChart } from '@/components/WeeklyDistanceChart';
import { authOptions } from '@/lib/auth';
import { getRunningSummary, getThisWeekDailyDistances, formatDuration, formatPace } from '@/lib/runningRecord';
import { getAiRecoPanelCourses } from '@/lib/aiRecommendation';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  const [summary, dailyDistances, recoCourses] = await Promise.all([
    session?.user?.id ? getRunningSummary(session.user.id) : Promise.resolve(null),
    session?.user?.id ? getThisWeekDailyDistances(session.user.id) : Promise.resolve([]),
    getAiRecoPanelCourses(session?.user?.id ?? null)
  ]);

  return (
    <div className="home-page">
      <FeatureBanner />

      <AiRecoPanel courses={recoCourses} />

      <section className="home-hero">
        <div className="hero-bg" />
        <div className="hero-content">
          <p className="eyebrow">DAI RUN</p>
          <HomeGreeting />
          <LocationPermissionButton />
        </div>
      </section>

      <AiRecoPanel courses={recoCourses} />

      <section className="home-top-row">
        <Card className="run-summary-card">
          <div className="card-head"><h3>나의 러닝 요약</h3><span className="muted">최근 4주</span></div>
          {summary ? (
            <>
              <div className="summary-stats summary-stats-lg">
                <StatCard icon="↔" label="거리" value={(summary.totalDistanceM / 1000).toFixed(1)} suffix="km" />
                <StatCard icon="⏱" label="시간" value={formatDuration(summary.totalDurationSec)} />
                <StatCard
                  icon="⚡"
                  label="평균 페이스"
                  value={summary.averagePaceSecPerKm ? formatPace(summary.averagePaceSecPerKm) : '-'}
                  suffix="/km"
                />
                <StatCard
                  icon="🚀"
                  label="최고 페이스"
                  value={summary.bestPaceSecPerKm ? formatPace(summary.bestPaceSecPerKm) : '-'}
                  suffix="/km"
                />
                <StatCard icon="❤" label="평균 심박수" value={summary.averageHeartRate ? String(summary.averageHeartRate) : '-'} suffix="bpm" />
                <StatCard icon="💥" label="최고 심박수" value={summary.maxHeartRate ? String(summary.maxHeartRate) : '-'} suffix="bpm" />
                <StatCard icon="🔥" label="칼로리" value={summary.totalCalories.toLocaleString()} suffix="kcal" />
              </div>
              <WeeklyDistanceChart data={dailyDistances} />
              <p className="muted">최근 {summary.runCount}회 러닝 기록 기준</p>
            </>
          ) : (
            <p className="muted">최근 4주 동안의 러닝 기록이 아직 없어요.</p>
          )}
          <Link href="/mypage#running-records" className="ghost-btn">상세 기록 보기</Link>
        </Card>

        <div className="home-weather-col">
          <WeatherPanel />
        </div>
      </section>

      <section className="home-cta">
        <h2>우리 오늘 달려볼까요?</h2>
        <Link href="/courses" className="primary-btn">추천 코스 살펴보기</Link>
      </section>
    </div>
  );
}
