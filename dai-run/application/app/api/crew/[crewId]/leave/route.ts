import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { leaveCrew } from '@/lib/crew';

// 크루 채팅방 "나가기" 확인 후 호출되는 실제 탈퇴 처리. 마지막 멤버였다면 크루 자체가 삭제된다.
export async function POST(request: Request, { params }: { params: { crewId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const result = await leaveCrew(params.crewId, session.user.id);
  if (result === 'not-member') {
    return NextResponse.json({ error: '이 크루의 멤버가 아니에요.' }, { status: 404 });
  }
  return NextResponse.json({ success: true, crewDeleted: result === 'crew-deleted' });
}
