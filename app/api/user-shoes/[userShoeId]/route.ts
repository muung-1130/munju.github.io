import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { UserShoeOwnershipError, UserShoeValidationError, getEditableUserShoe, updateUserShoe } from '@/lib/userShoes';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { userShoeId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const shoe = await getEditableUserShoe(session.user.id, params.userShoeId);
  if (!shoe) {
    return NextResponse.json({ error: '신발을 찾을 수 없어요.' }, { status: 404 });
  }
  return NextResponse.json({ shoe });
}

export async function PATCH(request: NextRequest, { params }: { params: { userShoeId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '요청 형식이 올바르지 않아요.' }, { status: 400 });
  }

  try {
    await updateUserShoe(session.user.id, params.userShoeId, {
      shoeModelId: Number(body.shoeModelId),
      nickname: body.nickname ? String(body.nickname) : null,
      purchaseDate: String(body.purchaseDate ?? ''),
      initialDistanceM: body.initialDistanceM ? Number(body.initialDistanceM) : 0
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof UserShoeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof UserShoeOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('update user shoe failed', error);
    return NextResponse.json({ error: '러닝화를 수정할 수 없어요.' }, { status: 500 });
  }
}
