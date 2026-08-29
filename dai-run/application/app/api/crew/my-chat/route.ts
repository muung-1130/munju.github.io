import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMostRecentCrewChat } from '@/lib/crew';
import { getCrewChatMessages } from '@/lib/crewChat';

export const dynamic = 'force-dynamic';

// 로그인 직후(또는 로그아웃 후 재로그인) 크루 채팅 아이콘을 복원하기 위한 endpoint.
// 이 사용자가 이미 입장해본 채팅방 중 가장 최근 것을 찾아 그대로 돌려준다.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ crewId: null });
  }
  const recent = await getMostRecentCrewChat(session.user.id);
  if (!recent) {
    return NextResponse.json({ crewId: null });
  }
  const messages = await getCrewChatMessages(recent.crewId);
  return NextResponse.json({ crewId: recent.crewId, crewName: recent.crewName, messages });
}
