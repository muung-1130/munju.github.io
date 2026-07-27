import { Router } from 'express';
import { FEEDBACK_TYPES, getAiRecoPanelCourses, recordRecommendationFeedback } from '../lib/aiRecommendation.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

// app/page.tsx, app/courses/page.tsx가 SSR 중에 직접 함수를 부르는 대신 이 엔드포인트를
// fetch한다(Next.js가 세션 쿠키를 그대로 넘겨준다).
router.get('/panel', async (req, res) => {
  const courses = await getAiRecoPanelCourses(req.userId ?? null);
  res.json({ courses });
});

router.post('/feedback', requireAuth, async (req, res) => {
  const { recommendationId, courseId, feedbackType } = req.body ?? {};
  if (typeof recommendationId !== 'string' || typeof courseId !== 'string') {
    res.status(400).json({ error: 'recommendationId와 courseId가 필요해요.' });
    return;
  }
  if (!FEEDBACK_TYPES.includes(feedbackType)) {
    res.status(400).json({ error: `feedbackType은 ${FEEDBACK_TYPES.join('/')} 중 하나여야 해요.` });
    return;
  }

  try {
    await recordRecommendationFeedback(req.userId!, recommendationId, courseId, feedbackType);
    res.json({ success: true });
  } catch {
    res.status(200).json({ success: false });
  }
});

export default router;
