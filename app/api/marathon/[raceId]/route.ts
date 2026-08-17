import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMarathonRaceById, getRaceCapacityStatus, getRegistrationWindow, getMyReservationsForRaces } from '@/lib/marathon';

export const dynamic = 'force-dynamic';

// 마라톤 상세/신청 페이지용 — 대회 정보 + (독점 콜라보인 경우) 접수창·정원 현황을 가벼운 GET으로
// 내려준다. 신청 트랜잭션(FOR UPDATE 락)과 분리된 read-only 조회라 대기 중인 사용자들이 이
// 엔드포인트를 자주 폴링해도 신청 처리 자체에는 부담을 주지 않는다.
export async function GET(_request: Request, { params }: { params: { raceId: string } }) {
  const raceId = Number(params.raceId);
  if (!Number.isInteger(raceId)) {
    return NextResponse.json({ error: '잘못된 대회예요.' }, { status: 400 });
  }

  const race = await getMarathonRaceById(raceId);
  if (!race) {
    return NextResponse.json({ error: '대회를 찾을 수 없어요.' }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  const [registrationWindow, capacityStatus, myReservationMap] = await Promise.all([
    race.isExclusiveCollab ? getRegistrationWindow(raceId) : Promise.resolve(null),
    race.isExclusiveCollab ? getRaceCapacityStatus(raceId) : Promise.resolve(null),
    session?.user?.id ? getMyReservationsForRaces(session.user.id, [raceId]) : Promise.resolve(new Map())
  ]);

  return NextResponse.json({
    race,
    registrationWindow,
    capacityStatus,
    myReservation: myReservationMap.get(raceId) ?? null
  });
}
