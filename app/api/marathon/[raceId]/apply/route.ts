import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { applyToMarathon } from '@/lib/marathon';

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

  const result = await applyToMarathon(session.user.id, raceId);
  if (result === 'race-not-found') {
    return NextResponse.json({ error: '대회를 찾을 수 없어요.' }, { status: 404 });
  }
  if (result === 'not-open') {
    return NextResponse.json({ error: '접수 기간이 아니에요.' }, { status: 409 });
  }
  if (result === 'already-applied') {
    return NextResponse.json({ error: '이미 신청한 대회예요.' }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
