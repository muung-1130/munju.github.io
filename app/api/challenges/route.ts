import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPersonalChallenges, getPublicChallenges } from '@/lib/challenges';
import { syncUserChallengeProgress } from '@/lib/challengeProgress';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  // 두 목록을 동시에(Promise.all) 조회하기 전에 동기화를 한 번만 실행한다 — 각 조회 함수 안에서
  // 따로 동기화하면 같은 러닝 기록을 두 번 동시에 처리하려다 challenge_progress_events의
  // UNIQUE 제약(source_event_id, participation_id)에 걸려 요청이 실패할 수 있다.
  if (userId) await syncUserChallengeProgress(userId);

  const [personal, publicChallenges] = await Promise.all([
    userId ? getPersonalChallenges(userId) : Promise.resolve([]),
    getPublicChallenges(userId)
  ]);

  return NextResponse.json({ personal, public: publicChallenges });
}
