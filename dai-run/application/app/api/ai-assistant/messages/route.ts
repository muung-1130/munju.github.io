import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getNewAssistantMessages } from '@/lib/aiChatMessages';

export const dynamic = 'force-dynamic';

// AssistantChatWidget이 주기적으로 폴링해서, 러닝 완료 축하 메시지 등 서버가 비동기로 보낸
// ASSISTANT 메시지를 말풍선으로 띄운다. since 이후에 생긴 메시지만 내려준다.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ messages: [] });
  }
  const since = request.nextUrl.searchParams.get('since');
  const messages = await getNewAssistantMessages(session.user.id, since);
  return NextResponse.json({ messages });
}
