import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { askAssistant } from '@/lib/aiChatMessages';

export const dynamic = 'force-dynamic';

// AssistantChatWidget의 서버 측 프록시. 브라우저는 ai-rag-service 주소를 알 필요가 없고,
// userId는 요청 본문이 아니라 인증 세션에서만 가져온다(비로그인 사용자는 userId 없이 일반 응답만 받는다).
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const body = await request.json().catch(() => null);
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 1000) {
    return NextResponse.json({ error: '질문은 1~1000자로 입력해주세요.' }, { status: 400 });
  }
  const bedrockSessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
  const latitude = typeof body?.latitude === 'number' ? body.latitude : null;
  const longitude = typeof body?.longitude === 'number' ? body.longitude : null;

  try {
    const result = await askAssistant(session?.user?.id ?? null, question, bedrockSessionId, latitude, longitude);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'AI 비서 응답을 가져오지 못했어요.' }, { status: 502 });
  }
}
