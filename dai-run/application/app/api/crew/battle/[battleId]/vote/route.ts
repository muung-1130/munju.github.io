import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { castVote } from '@/lib/crewBattle';

export async function POST(request: NextRequest, { params }: { params: { battleId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const { vote } = await request.json();
  if (vote !== 'AGREE' && vote !== 'DISAGREE') {
    return NextResponse.json({ error: '요청이 올바르지 않아요.' }, { status: 400 });
  }
  const tally = await castVote(params.battleId, session.user.id, vote);
  if (!tally) {
    return NextResponse.json({ error: '투표할 수 없어요.' }, { status: 403 });
  }
  return NextResponse.json({ success: true, tally });
}
