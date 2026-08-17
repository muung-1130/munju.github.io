import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { saveOnboardingPreferences, getRunningPreferences } from '@/lib/runningPreferences';

export const dynamic = 'force-dynamic';

const GOALS = ['HEALTH', 'DIET', 'ENDURANCE', 'MARATHON'];
const DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

// 코스탐색 온보딩 팝업 노출 여부 판단(hasPreferences)과, 설문 모달 프리필/마이페이지 시각화에
// 쓰이는 실제 저장값(preferences)을 함께 내려준다.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ hasPreferences: true, preferences: null });
  }
  const preferences = await getRunningPreferences(session.user.id);
  return NextResponse.json({ hasPreferences: preferences !== null, preferences });
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
  if (body.runningGoal && !GOALS.includes(body.runningGoal)) {
    return NextResponse.json({ error: '러닝 목표 값이 올바르지 않아요.' }, { status: 400 });
  }
  if (body.difficulty && !DIFFICULTIES.includes(body.difficulty)) {
    return NextResponse.json({ error: '숙련도 값이 올바르지 않아요.' }, { status: 400 });
  }

  try {
    await saveOnboardingPreferences(session.user.id, {
      runningGoal: body.runningGoal ?? null,
      difficulty: body.difficulty ?? null,
      preferredDistanceM: body.preferredDistanceM ? Number(body.preferredDistanceM) : null,
      preferredScenery: body.preferredScenery ?? null
    });
  } catch {
    return NextResponse.json({ error: '저장 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
