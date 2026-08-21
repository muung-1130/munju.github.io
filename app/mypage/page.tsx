import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Card, PageTitle, StatCard } from '@/components/UI';
import { WithdrawAccountButton } from '@/components/WithdrawAccountButton';
import { RunningStatsSection } from '@/components/RunningStatsSection';
import {
  getRunningSummary,
  getCurrentRunStreak,
  formatPace,
  formatDuration
} from '@/lib/runningRecord';
import { getUserWeightKgForDisplay } from '@/lib/calorie';
import { WeightEditableCalorieStat } from '@/components/WeightEditableCalorieStat';
import { getRunningPreferences } from '@/lib/runningPreferences';
import { PreferencesSummarySection } from '@/components/PreferencesSummarySection';

const MYPAGE_NAV_LINKS = [
  { href: '/mypage/liked-courses', icon: '🗺', label: '찜한 러닝코스' },
  { href: '/mypage/marathon-reservations', icon: '🏁', label: '신청한 마라톤' },
  { href: '/mypage/reviews', icon: '✍', label: '내가 남긴 리뷰' },
  { href: '/mypage/crews', icon: '👥', label: '내 크루' },
  { href: '/mypage/challenges', icon: '🎯', label: '하고있는 챌린지' },
  { href: '/mypage/completed-challenges', icon: '🏆', label: '완료한 챌린지' },
  { href: '/mypage/runs', icon: '🏃', label: '최근 러닝기록' },
  { href: '/mypage/shoes', icon: '👟', label: '보유 러닝화' },
  { href: '/mypage/liked-shoes', icon: '❤', label: '찜한 러닝화' }
];

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

  const [summary, streak, weightKg, runningPreferences] = await Promise.all([
    userId ? getRunningSummary(userId) : Promise.resolve(null),
    userId ? getCurrentRunStreak(userId) : Promise.resolve(0),
    userId ? getUserWeightKgForDisplay(userId) : Promise.resolve(66),
    userId ? getRunningPreferences(userId) : Promise.resolve(null)
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

      {streak > 0 && (
        <div className="run-streak-banner">
          🔥 오늘도 뛰었어요! 연속 러닝 <strong>{streak}일째</strong>
        </div>
      )}

      <nav className="mypage-nav-grid" aria-label="마이페이지 상세 메뉴">
        {MYPAGE_NAV_LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="mypage-nav-card">
            <span className="mypage-nav-card-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <WithdrawAccountButton />
    </div>
  );
}
