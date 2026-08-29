import { NextRequest, NextResponse } from 'next/server';
import { getCrewWeeklyStats } from '@/lib/crew';

export const dynamic = 'force-dynamic';

// 크루 채팅방 헤더의 "우리 크루" 아이콘을 hover했을 때 뜨는 최근 7일 평균 km/페이스 팝업용.
// services/crew-stats-scheduler가 매일 자정(KST)에 미리 계산해둔 캐시 값만 그대로 읽는다.
export async function GET(_request: NextRequest, { params }: { params: { crewId: string } }) {
  const stats = await getCrewWeeklyStats(params.crewId);
  if (!stats) {
    return NextResponse.json({ error: '크루를 찾을 수 없어요.' }, { status: 404 });
  }
  return NextResponse.json({ stats });
}
