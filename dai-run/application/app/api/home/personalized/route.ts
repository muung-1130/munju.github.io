import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRunningSummary, getThisWeekDailyDistances } from '@/lib/runningRecord';

// 홈 화면의 개인화 영역(나의 러닝 요약) 전용 API. 이 경로가 붙어있어야 app/page.tsx가
// force-dynamic 없이 정적/캐시 가능한 공개 shell로 남고, 세션·DB 조회는 클라이언트가 마운트된
// 뒤 이 엔드포인트를 통해서만 이뤄진다. nginx locations.conf에서 auth-web으로 라우팅된다
// (auth-web만 APP_ROLE=backend라 /api/* 요청을 허용한다).
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ authenticated: false }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const [summary, dailyDistances] = await Promise.all([
    getRunningSummary(session.user.id),
    getThisWeekDailyDistances(session.user.id)
  ]);

  return NextResponse.json(
    { authenticated: true, summary, dailyDistances },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
