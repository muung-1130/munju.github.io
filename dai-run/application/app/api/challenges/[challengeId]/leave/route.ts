import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { leavePublicChallenge } from '@/lib/challenges';

export async function POST(_request: Request, { params }: { params: { challengeId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }

  const result = await leavePublicChallenge(params.challengeId, session.user.id);
  if (result === 'not-joined') {
    return NextResponse.json({ error: '참여 중인 챌린지가 아니에요.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
