import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Card, PageTitle, StatCard } from '@/components/UI';
import { WithdrawAccountButton } from '@/components/WithdrawAccountButton';
import { RunningStatsSection } from '@/components/RunningStatsSection';
import { MyCrewsSection } from '@/components/MyCrewsSection';
import { MyChallengesSection } from '@/components/MyChallengesSection';
import { CompletedChallengesSection } from '@/components/CompletedChallengesSection';
import { RecentRunsTable } from '@/components/RecentRunsTable';
import { ShoesSection } from '@/components/ShoesSection';
import { LikedShoesSection } from '@/components/LikedShoesSection';
import { LikedCoursesSection } from '@/components/LikedCoursesSection';
import { MyMarathonReservationsSection } from '@/components/MyMarathonReservationsSection';
import { MyCourseReviewsSection } from '@/components/MyCourseReviewsSection';
import {
  getRunningSummary,
  getCurrentRunStreak,
  getRecentRunsDetailed,
  formatPace,
  formatDuration
} from '@/lib/runningRecord';
import { getMyActiveCrews } from '@/lib/crew';
import { getMyActiveChallengesWeeklyProgress, getCompletedChallenges } from '@/lib/challenges';
import { getUserShoesDetailed, getUserLikedShoes } from '@/lib/shoes';
import { getUserLikedCourses, getUserCourseReviews } from '@/lib/courseSocial';
import { getMyMarathonReservations } from '@/lib/marathon';
import { getUserWeightKgForDisplay } from '@/lib/calorie';
import { WeightEditableCalorieStat } from '@/components/WeightEditableCalorieStat';
import { getRunningPreferences } from '@/lib/runningPreferences';
import { PreferencesSummarySection } from '@/components/PreferencesSummarySection';

function formatJoinDate(iso?: string) {
  if (!iso) return '-';
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

export default async function MyPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const nickname = session?.user?.name ?? '러너';
  const email = session?.user?.email ?? '-';
  const joinDate = formatJoinDate(session?.user?.createdAt);

  const [
    summary,
    streak,
    myCrews,
    myChallenges,
    completedChallenges,
    recentRuns,
    myShoes,
    likedShoes,
    likedCourses,
    weightKg,
    runningPreferences,
    myMarathonReservations,
    myCourseReviews
  ] = await Promise.all([
    userId ? getRunningSummary(userId) : Promise.resolve(null),
    userId ? getCurrentRunStreak(userId) : Promise.resolve(0),
    userId ? getMyActiveCrews(userId) : Promise.resolve([]),
    userId ? getMyActiveChallengesWeeklyProgress(userId) : Promise.resolve([]),
    userId ? getCompletedChallenges(userId) : Promise.resolve([]),
    userId ? getRecentRunsDetailed(userId) : Promise.resolve([]),
    userId ? getUserShoesDetailed(userId) : Promise.resolve([]),
    userId ? getUserLikedShoes(userId) : Promise.resolve([]),
    userId ? getUserLikedCourses(userId) : Promise.resolve([]),
    userId ? getUserWeightKgForDisplay(userId) : Promise.resolve(66),
    userId ? getRunningPreferences(userId) : Promise.resolve(null),
    userId ? getMyMarathonReservations(userId) : Promise.resolve([]),
    userId ? getUserCourseReviews(userId) : Promise.resolve([])
  ]);

  const avgDistanceM = summary && summary.runCount > 0 ? summary.totalDistanceM / summary.runCount : null;
  const avgDurationSec = summary && summary.runCount > 0 ? summary.totalDurationSec / summary.runCount : null;

  return (
    <div>
      <PageTitle title="마이페이지" subtitle="나의 러닝 활동과 성과를 한눈에 확인하세요." />
      <Card className="profile-summary">
        <div className="profile-left">
          <div>
            <h2>{nickname}</h2>
            <p>{email}</p>
            <p>가입일 {joinDate}</p>
          </div>
        </div>
        <div className="profile-stats-grid">
          <StatCard icon="〽" label="누적 거리" value={summary ? (summary.totalDistanceM / 1000).toFixed(1) : '-'} suffix={summary ? 'km' : undefined} />
          <StatCard icon="⏱" label="누적 시간" value={summary ? formatDuration(summary.totalDurationSec) : '-'} />
          <StatCard icon="↔" label="평균 거리" value={avgDistanceM !== null ? (avgDistanceM / 1000).toFixed(1) : '-'} suffix={avgDistanceM !== null ? 'km' : undefined} />
          <StatCard icon="🕓" label="평균 시간" value={avgDurationSec !== null ? formatDuration(Math.round(avgDurationSec)) : '-'} />
          <StatCard
            icon="⚡"
            label="평균 페이스"
            value={summary?.averagePaceSecPerKm ? formatPace(summary.averagePaceSecPerKm) : '-'}
            suffix={summary?.averagePaceSecPerKm ? '/km' : undefined}
          />
          <StatCard
            icon="🚀"
            label="최고 페이스"
            value={summary?.bestPaceSecPerKm ? formatPace(summary.bestPaceSecPerKm) : '-'}
            suffix={summary?.bestPaceSecPerKm ? '/km' : undefined}
          />
          <StatCard icon="❤" label="평균 심박수" value={summary?.averageHeartRate ? String(summary.averageHeartRate) : '-'} suffix={summary?.averageHeartRate ? 'bpm' : undefined} />
          <StatCard icon="💥" label="최고 심박수" value={summary?.maxHeartRate ? String(summary.maxHeartRate) : '-'} suffix={summary?.maxHeartRate ? 'bpm' : undefined} />
          <StatCard icon="👟" label="평균 케이던스" value={summary?.averageCadence ? String(summary.averageCadence) : '-'} suffix={summary?.averageCadence ? 'spm' : undefined} />
          <StatCard icon="⛰" label="누적 상승고도" value={summary ? summary.totalElevationGainM.toFixed(0) : '-'} suffix={summary ? 'm' : undefined} />
          <WeightEditableCalorieStat totalCalories={summary ? summary.totalCalories : null} weightKg={weightKg} />
        </div>
      </Card>

      <RunningStatsSection />

      <PreferencesSummarySection preferences={runningPreferences} />

      <LikedCoursesSection courses={likedCourses} />

      <MyMarathonReservationsSection reservations={myMarathonReservations} />

      <MyCourseReviewsSection reviews={myCourseReviews} />

      <MyCrewsSection crews={myCrews} />

      <MyChallengesSection challenges={myChallenges} />

      <CompletedChallengesSection challenges={completedChallenges} />

      {streak > 0 && (
        <div className="run-streak-banner">
          🔥 오늘도 뛰었어요! 연속 러닝 <strong>{streak}일째</strong>
        </div>
      )}
      <RecentRunsTable runs={recentRuns} />

      <ShoesSection shoes={myShoes} />

      <LikedShoesSection shoes={likedShoes} />

      <WithdrawAccountButton />
    </div>
  );
}
