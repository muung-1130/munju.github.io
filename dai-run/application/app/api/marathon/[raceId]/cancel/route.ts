import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { cancelMarathonReservation } from '@/lib/marathon';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, { params }: { params: { raceId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const raceId = Number(params.raceId);
  if (!Number.isInteger(raceId)) {
    return NextResponse.json({ error: '잘못된 대회예요.' }, { status: 400 });
  }

  const cancelled = await cancelMarathonReservation(session.user.id, raceId);
  if (!cancelled) {
    return NextResponse.json({ error: '신청 내역을 찾을 수 없어요.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
