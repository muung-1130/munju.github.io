import { Router } from 'express';
import { applyChallengeProgress } from '../lib/challengeRules.js';
import { refreshCrewBattlesForUser } from '../lib/crewBattle.js';
import { sendRunCongratsMessage } from '../lib/aiChatMessages.js';
import type { RunCompletedEventPayload } from '../lib/kafka.js';

const router = Router();

// run-completion-consumer(Kafka 소비자)가 running.run-completed-events를 받을 때마다 호출하는
// 내부 전용 엔드포인트다. 브라우저에서는 절대 호출할 일이 없으므로 세션이 아니라 공유 비밀값으로
// 검증한다.
//
// MVP 타협: 챌린지 진행도(Challenge)/크루 배틀 갱신(Crew)/AI 축하 메시지(AI Assistant)는
// 원래 각자 다른 서비스 소유 로직인데, 지금은 이벤트로 완전히 쪼개지 않고 이 서비스가 그 세
// 서비스의 로직을 그대로 복사해 동기 호출하고 있다 — 서비스 경계는 물리적으로 나눴지만 이
// 한 곳만은 아직 결합돼 있다는 뜻. 나중에 각 서비스가 Kafka 이벤트를 직접 구독하는 방식으로
// 바꾸는 게 정석이다.
router.post('/run-completed', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const body = req.body;
  const eventId: string | undefined = body?.eventId;
  const run: RunCompletedEventPayload | undefined = body?.payload;
  if (!eventId || !run?.runId || !run?.userId) {
    res.status(400).json({ error: 'invalid payload' });
    return;
  }

  try {
    const { completedChallengeNames } = await applyChallengeProgress(eventId, run);
    await refreshCrewBattlesForUser(run.userId).catch((err) => console.error('refreshCrewBattlesForUser 실패:', err));
    await sendRunCongratsMessage(eventId, run.userId, run, completedChallengeNames).catch((err) =>
      console.error('sendRunCongratsMessage 실패:', err)
    );
    res.json({ success: true, completedChallengeNames });
  } catch (err) {
    console.error('run-completed 처리 실패:', err);
    res.status(500).json({ error: 'processing failed' });
  }
});

export default router;
