import { NextRequest, NextResponse } from 'next/server';
import { applyChallengeProgress } from '@/lib/challengeRules';
import { refreshCrewBattlesForUser } from '@/lib/crewBattle';
import { sendRunCongratsMessage } from '@/lib/aiChatMessages';
import type { RunCompletedEventPayload } from '@/lib/kafka';

export const dynamic = 'force-dynamic';

// run-completion-consumer(Kafka 소비자)가 running.run-completed-events를 받을 때마다 호출하는
// 내부 전용 엔드포인트다. 브라우저에서는 절대 호출할 일이 없으므로 세션이 아니라 공유 비밀값으로
// 검증한다 — 이 서버들이 같은 docker 네트워크 안에 있어도, nginx가 이 경로를 외부로 그대로
// 열어주고 있을 수 있으니 방어적으로 막아둔다.
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-internal-secret');
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const eventId: string | undefined = body?.eventId;
  const run: RunCompletedEventPayload | undefined = body?.payload;
  if (!eventId || !run?.runId || !run?.userId) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  try {
    const { completedChallengeNames } = await applyChallengeProgress(eventId, run);
    await refreshCrewBattlesForUser(run.userId).catch((err) => console.error('refreshCrewBattlesForUser 실패:', err));
    await sendRunCongratsMessage(eventId, run.userId, run, completedChallengeNames).catch((err) =>
      console.error('sendRunCongratsMessage 실패:', err)
    );
    return NextResponse.json({ success: true, completedChallengeNames });
  } catch (err) {
    console.error('run-completed 처리 실패:', err);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
