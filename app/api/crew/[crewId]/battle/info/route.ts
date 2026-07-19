import { NextRequest, NextResponse } from 'next/server';
import { getCrewBattleInfo, type BattleMetricType } from '@/lib/crewBattle';

export const dynamic = 'force-dynamic';

// 배틀 배지가 달린 크루명을 hover/클릭했을 때 뜨는 랭킹·승수 팝업용.
export async function GET(request: NextRequest, { params }: { params: { crewId: string } }) {
  const metric = request.nextUrl.searchParams.get('metric');
  const metricType: BattleMetricType = metric === 'PACE' ? 'PACE' : 'DISTANCE';
  const info = await getCrewBattleInfo(params.crewId, metricType);
  if (!info) {
    return NextResponse.json({ error: '크루를 찾을 수 없어요.' }, { status: 404 });
  }
  return NextResponse.json({ info });
}
