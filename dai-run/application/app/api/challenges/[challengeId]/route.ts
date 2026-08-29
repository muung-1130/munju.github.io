import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { deletePersonalChallenge, getChallengeDailyLog, getChallengeDetail } from '@/lib/challenges';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { challengeId: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const detail = await getChallengeDetail(params.challengeId, userId);
  if (!detail) {
    return NextResponse.json({ error: '챌린지를 찾을 수 없어요.' }, { status: 404 });
  }
  const dailyLog = userId && detail.myStatus ? await getChallengeDailyLog(params.challengeId, userId) : [];
  return NextResponse.json({ challenge: detail, dailyLog });
}

// 개인 챌린지 삭제(soft) — 만든 본인만 가능하다.
export async function DELETE(_request: Request, { params }: { params: { challengeId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const result = await deletePersonalChallenge(params.challengeId, session.user.id);
  if (result === 'not-found') {
    return NextResponse.json({ error: '삭제할 수 있는 개인 챌린지가 아니에요.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
