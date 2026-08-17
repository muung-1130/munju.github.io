import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ChallengeValidationError, createChallenge, getPersonalChallenges, getPublicChallenges } from '@/lib/challenges';
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

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '요청 형식이 올바르지 않아요.' }, { status: 400 });
  }
  if (body.challengeType !== 'PERSONAL' && body.challengeType !== 'PUBLIC') {
    return NextResponse.json({ error: '챌린지 유형을 선택해 주세요.' }, { status: 400 });
  }
  if (!['DISTANCE', 'COUNT', 'PACE', 'STREAK'].includes(body.metricType)) {
    return NextResponse.json({ error: '목표 지표를 선택해 주세요.' }, { status: 400 });
  }

  try {
    const challengeId = await createChallenge(session.user.id, {
      challengeType: body.challengeType,
      name: String(body.name ?? ''),
      description: body.description ? String(body.description) : null,
      metricType: body.metricType,
      targetValue: Number(body.targetValue),
      startAt: String(body.startAt ?? ''),
      endAt: String(body.endAt ?? ''),
      rules: body.rules ?? null
    });
    return NextResponse.json({ challengeId }, { status: 201 });
  } catch (error) {
    if (error instanceof ChallengeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('create challenge failed', error);
    return NextResponse.json({ error: '챌린지를 만들 수 없어요.' }, { status: 500 });
  }
}
