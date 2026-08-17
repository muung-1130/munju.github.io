import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getShoeLikeState, toggleShoeLike } from '@/lib/shoes';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { shoeId: string } }) {
  const session = await getServerSession(authOptions);
  const shoeId = Number(params.shoeId);
  if (!Number.isInteger(shoeId)) {
    return NextResponse.json({ error: '잘못된 러닝화예요.' }, { status: 400 });
  }
  const state = await getShoeLikeState(shoeId, session?.user?.id ?? null);
  return NextResponse.json(state);
}

export async function POST(_request: NextRequest, { params }: { params: { shoeId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const shoeId = Number(params.shoeId);
  if (!Number.isInteger(shoeId)) {
    return NextResponse.json({ error: '잘못된 러닝화예요.' }, { status: 400 });
  }
  const state = await toggleShoeLike(shoeId, session.user.id);
  return NextResponse.json(state);
}
