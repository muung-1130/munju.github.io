import { Router } from 'express';
import { askAssistant, getNewAssistantMessages } from '../lib/aiChatMessages.js';

const router = Router();

router.post('/chat', async (req, res) => {
  const body = req.body;
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 1000) {
    res.status(400).json({ error: '질문은 1~1000자로 입력해주세요.' });
    return;
  }
  const bedrockSessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
  const latitude = typeof body?.latitude === 'number' ? body.latitude : null;
  const longitude = typeof body?.longitude === 'number' ? body.longitude : null;

  try {
    const result = await askAssistant(req.userId ?? null, question, bedrockSessionId, latitude, longitude);
    res.json(result);
  } catch {
    res.status(502).json({ error: 'AI 비서 응답을 가져오지 못했어요.' });
  }
});

router.get('/messages', async (req, res) => {
  if (!req.userId) {
    res.json({ messages: [] });
    return;
  }
  const since = typeof req.query.since === 'string' ? req.query.since : null;
  const messages = await getNewAssistantMessages(req.userId, since);
  res.json({ messages });
});

export default router;
