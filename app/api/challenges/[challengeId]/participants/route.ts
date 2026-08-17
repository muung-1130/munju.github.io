import { NextResponse } from 'next/server';
import { getHallOfFame, getLiveParticipants } from '@/lib/challenges';

export const dynamic = 'force-dynamic';

// 공개 챌린지 상세 페이지가 폴링하는 실시간 데이터. participants는 joined_at 내림차순이라
// 오늘 참여한 사람부터 전날, 그 전날 순으로 자연스럽게 묶여서 내려간다.
export async function GET(request: Request, { params }: { params: { challengeId: string } }) {
  const [participants, hallOfFame] = await Promise.all([
    getLiveParticipants(params.challengeId),
    getHallOfFame(params.challengeId)
  ]);
  return NextResponse.json({ participants, hallOfFame });
}
