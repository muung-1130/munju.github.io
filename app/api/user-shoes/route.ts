import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { UserShoeValidationError, createUserShoe } from '@/lib/userShoes';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '요청 형식이 올바르지 않아요.' }, { status: 400 });
  }

  try {
    const userShoeId = await createUserShoe(session.user.id, {
      shoeModelId: Number(body.shoeModelId),
      nickname: body.nickname ? String(body.nickname) : null,
      purchaseDate: String(body.purchaseDate ?? ''),
      initialDistanceM: body.initialDistanceM ? Number(body.initialDistanceM) : 0
    });
    return NextResponse.json({ userShoeId }, { status: 201 });
  } catch (error) {
    if (error instanceof UserShoeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('create user shoe failed', error);
    return NextResponse.json({ error: '러닝화를 등록할 수 없어요.' }, { status: 500 });
  }
}
