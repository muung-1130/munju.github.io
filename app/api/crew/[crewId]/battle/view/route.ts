import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isActiveCrewMember } from '@/lib/crew';
import { getPendingBattleView, getBattleView, getBattleCandidates } from '@/lib/crewBattle';

export const dynamic = 'force-dynamic';

// 크루 배틀 패널 하나가 필요한 정보를 한 번에 내려준다: 크루원 동의 대기 중인 제안(pending),
// 진행/방금 종료된 배틀(active), 또는 아직 아무 배틀도 없을 때의 추천 후보(recommendations).
export async function GET(request: Request, { params }: { params: { crewId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  if (!(await isActiveCrewMember(params.crewId, session.user.id))) {
    return NextResponse.json({ error: '이 크루의 멤버만 볼 수 있어요.' }, { status: 403 });
  }

  const active = await getBattleView(params.crewId, session.user.id);
  if (active) {
    return NextResponse.json({ pending: null, active, recommendations: null });
  }

  const pending = await getPendingBattleView(params.crewId, session.user.id);
  if (pending) {
    return NextResponse.json({ pending, active: null, recommendations: null });
  }

  const [distance, pace] = await Promise.all([
    getBattleCandidates(params.crewId, 'DISTANCE'),
    getBattleCandidates(params.crewId, 'PACE')
  ]);
  return NextResponse.json({ pending: null, active: null, recommendations: { distance, pace } });
}
