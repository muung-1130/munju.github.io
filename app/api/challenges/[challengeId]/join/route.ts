import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { joinPublicChallenge } from '@/lib/challenges';

export async function POST(request: Request, { params }: { params: { challengeId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }

  const result = await joinPublicChallenge(params.challengeId, session.user.id);
  if (result === 'not-found') {
    return NextResponse.json({ error: '참여할 수 없는 챌린지예요.' }, { status: 404 });
  }
  if (result === 'already-joined') {
    return NextResponse.json({ error: '이미 참여 중인 챌린지예요.' }, { status: 409 });
  }
  if (result === 'not-open-yet') {
    return NextResponse.json({ error: '참여 신청은 챌린지 시작일 전날에만 할 수 있어요.' }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
