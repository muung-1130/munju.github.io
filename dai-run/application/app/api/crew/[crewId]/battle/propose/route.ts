import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isActiveCrewMember } from '@/lib/crew';
import { proposeBattle, type BattleMetricType } from '@/lib/crewBattle';

export async function POST(request: NextRequest, { params }: { params: { crewId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  if (!(await isActiveCrewMember(params.crewId, session.user.id))) {
    return NextResponse.json({ error: '이 크루의 멤버만 제안할 수 있어요.' }, { status: 403 });
  }

  const { opponentCrewId, metricType } = await request.json();
  if (typeof opponentCrewId !== 'string' || (metricType !== 'DISTANCE' && metricType !== 'PACE')) {
    return NextResponse.json({ error: '요청이 올바르지 않아요.' }, { status: 400 });
  }

  const result = await proposeBattle(params.crewId, opponentCrewId, metricType as BattleMetricType, session.user.id);
  if (result === 'already-in-battle' || result === 'opponent-unavailable') {
    return NextResponse.json({ error: '투표중인 배틀이 이미 있습니다!' }, { status: 409 });
  }
  return NextResponse.json({ success: true, battleId: result.battleId });
}
