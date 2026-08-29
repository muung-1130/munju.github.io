import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { leaveBattle } from '@/lib/crewBattle';

// 진행 중인 배틀에서 크루 단위로 나간다 — 크루장만 가능하다(leaveBattle 내부에서 소유자 검증).
export async function POST(request: Request, { params }: { params: { crewId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const ok = await leaveBattle(params.crewId, session.user.id);
  if (!ok) {
    return NextResponse.json({ error: '크루장만 배틀에서 나갈 수 있어요.' }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
