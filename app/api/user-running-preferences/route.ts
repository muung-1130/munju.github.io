import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasRunningPreferences, saveOnboardingPreferences } from '@/lib/runningPreferences';

export const dynamic = 'force-dynamic';

const GOALS = ['HEALTH', 'DIET', 'ENDURANCE', 'MARATHON'];
const DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

// 코스탐색 온보딩 팝업 노출 여부 판단용 — 이미 선호도가 있으면 다시 물어보지 않는다.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ hasPreferences: true });
  }
  const hasPreferences = await hasRunningPreferences(session.user.id);
  return NextResponse.json({ hasPreferences });
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

  await saveOnboardingPreferences(session.user.id, {
    runningGoal: body.runningGoal ?? null,
    difficulty: body.difficulty ?? null,
    preferredDistanceM: body.preferredDistanceM ? Number(body.preferredDistanceM) : null,
    preferredScenery: body.preferredScenery ?? null
  });
  return NextResponse.json({ success: true });
}
