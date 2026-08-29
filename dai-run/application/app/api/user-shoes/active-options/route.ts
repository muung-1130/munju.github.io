import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getActiveUserShoeOptions } from '@/lib/userShoes';

export const dynamic = 'force-dynamic';

// 러닝 종료 화면의 "무슨 신발을 신었나요?" 선택지용 경량 목록.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ shoes: [] });
  }
  const shoes = await getActiveUserShoeOptions(session.user.id);
  return NextResponse.json({ shoes });
}
