import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { UserShoeOwnershipError, retireUserShoe } from '@/lib/userShoes';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, { params }: { params: { userShoeId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  try {
    await retireUserShoe(session.user.id, params.userShoeId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof UserShoeOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('retire user shoe failed', error);
    return NextResponse.json({ error: '러닝화를 버릴 수 없어요.' }, { status: 500 });
  }
}
