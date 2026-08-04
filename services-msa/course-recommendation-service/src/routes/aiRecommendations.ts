import { Router } from 'express';
import { FEEDBACK_TYPES, getAiRecoPanelCourses, recordRecommendationFeedback } from '../lib/aiRecommendation.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

// app/page.tsx, app/courses/page.tsx가 SSR 중에 직접 함수를 부르는 대신 이 엔드포인트를
// fetch한다(Next.js가 세션 쿠키를 그대로 넘겨준다). SSR 시점엔 브라우저 GPS를 알 수 없어
// lat/lng 없이 호출되고, AiRecoPanel이 마운트된 뒤 실제 위치를 얻으면 lat/lng을 붙여 다시
// 호출한다 — 오늘 추천이 이미 계산돼 있으면 ensureTodaysRecommendation이 하루 1회 제한으로
// 이 좌표를 무시하고 기존 결과를 그대로 돌려준다.
router.get('/panel', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const location =
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      ? { latitude: lat, longitude: lng }
      : undefined;
  const courses = await getAiRecoPanelCourses(req.userId ?? null, location);
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
