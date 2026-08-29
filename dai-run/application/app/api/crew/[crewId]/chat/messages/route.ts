import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCrewChatMessages, addCrewChatMessage } from '@/lib/crewChat';

export async function GET(request: NextRequest, { params }: { params: { crewId: string } }) {
  const messages = await getCrewChatMessages(params.crewId);
  return NextResponse.json({ messages });
}

export async function POST(request: NextRequest, { params }: { params: { crewId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const { message } = await request.json();
  if (typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: '메시지를 입력해주세요.' }, { status: 400 });
  }

  const saved = await addCrewChatMessage(params.crewId, session.user.id, session.user.name ?? '나', message.trim().slice(0, 500));
  return NextResponse.json({ message: saved });
}
