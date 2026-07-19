import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { leaderDecide } from '@/lib/crewBattle';

export async function POST(request: NextRequest, { params }: { params: { battleId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const { approve } = await request.json();
  const ok = await leaderDecide(params.battleId, session.user.id, Boolean(approve));
  if (!ok) {
    return NextResponse.json({ error: '크루장만 결정할 수 있어요.' }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
