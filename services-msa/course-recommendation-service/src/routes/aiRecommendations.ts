import { Router } from 'express';
import { FEEDBACK_TYPES, getAiRecoPanelCourses, recordRecommendationFeedback } from '../lib/aiRecommendation.js';
import { DAILY_MANUAL_REFRESH_LIMIT, getManualRefreshCountToday } from '../lib/aiRecommendationOrchestrator.js';
import { getRedisClient } from '../lib/redis.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();
const RECOMMENDATION_TYPES = ['location_based', 'distance_based', 'difficulty_based', 'popular_based'];
// 추천 결과 자체는 하루 1회(KST 03:00 기준)만 재계산되므로(ensureTodaysRecommendation) 패널 응답을
// 몇 분 캐시해도 오늘의 추천이 바뀌는 일은 없다 — DB/Bedrock 재계산이 아니라 "홈/코스탐색 페이지를
// 새로고침할 때마다 반복되는 조회"만 줄이는 목적이다(redis-usage-guide 코스 추천 패널 TTL 권장 5~15분).
const PANEL_CACHE_TTL_SECONDS = 300;

// app/page.tsx, app/courses/page.tsx가 SSR 중에 직접 함수를 부르는 대신 이 엔드포인트를
// fetch한다(Next.js가 세션 쿠키를 그대로 넘겨준다). SSR 시점엔 브라우저 GPS를 알 수 없어
// lat/lng 없이 호출되고, AiRecoPanel이 마운트된 뒤 실제 위치를 얻으면 lat/lng을 붙여 다시
// 호출한다 — 오늘 추천이 이미 계산돼 있으면 ensureTodaysRecommendation이 하루 1회 제한으로
// 이 좌표를 무시하고 기존 결과를 그대로 돌려준다.
//
// 반경/추천기준 버튼은 더 이상 누르는 즉시 재조회하지 않는다 — 사용자가 값을 고른 뒤
// "AI 추천 다시 받기"를 눌러야만(forceRefresh=true) 그 값으로 실제 재계산이 일어난다.
router.get('/panel', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const location =
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      ? { latitude: lat, longitude: lng }
      : undefined;
  // forceRefresh("AI 추천 다시 받기" 버튼)와 반경/추천기준 필터는 로그인 사용자만 의미가 있다 —
  // 비로그인/게스트는 전원이 공유하는 공용 기본 추천이라 한 사람이 강제로 새로고침하면 다른 모든
  // 게스트의 결과까지 바뀌게 되므로 여기서 무시한다.
  const isLoggedIn = Boolean(req.userId);
  const radiusKmRaw = Number(req.query.radiusKm);
  const searchRadiusKm = isLoggedIn && Number.isFinite(radiusKmRaw) && radiusKmRaw > 0 && radiusKmRaw <= 10 ? radiusKmRaw : undefined;
  const recommendationTypeRaw = typeof req.query.recommendationType === 'string' ? req.query.recommendationType : undefined;
  const recommendationType =
    isLoggedIn && recommendationTypeRaw && RECOMMENDATION_TYPES.includes(recommendationTypeRaw) ? recommendationTypeRaw : undefined;

  // forceRefresh나 반경/추천기준 필터는 그 자체가 "지금 이 값으로 다시 계산해줘"라는 명시적
  // 요청이라 캐시를 건너뛴다 — 캐시는 어디까지나 같은 사용자가 반복해서 패널을 열어볼 때
  // 매번 DB를 다시 훑는 걸 줄이기 위한 것이다(redis-usage-guide §5, §6). 하루 사용 횟수를
  // 다 썼는지(remainingBefore)는 어차피 DB 조회가 필요해 아래에서 확정하므로, 여기서는 클라이언트가
  // "요청은 했는지"만으로 캐시 read 여부를 정한다 — 결과적으로 서버가 거부할 forceRefresh 요청도
  // 캐시를 안 타지만, 그 정도는 안전한 쪽으로 더 보수적일 뿐이다.
  const forceRefreshRequested = req.query.forceRefresh === 'true' && isLoggedIn;
  const hasInlineFilter = Boolean(searchRadiusKm || recommendationType);
  const cacheKey = `course-recommendation:panel:${req.userId ?? 'guest'}`;
  const redis = await getRedisClient();

  if (redis && !forceRefreshRequested && !hasInlineFilter) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }
    } catch (err) {
      console.error('[ai-recommendations] redis get failed, falling back to DB', err);
    }
  }

  const remainingBefore = isLoggedIn
    ? Math.max(0, DAILY_MANUAL_REFRESH_LIMIT - (await getManualRefreshCountToday(req.userId!)))
    : 0;
  // 하루 사용 횟수를 다 썼으면 forceRefresh 요청이 와도 서버에서 무시한다(버튼 비활성/팝업은
  // 프론트가 처리하지만, 직접 API를 호출하는 우회도 막기 위해 여기서도 한 번 더 막는다).
  const forceRefresh = forceRefreshRequested && remainingBefore > 0;

  const courses = await getAiRecoPanelCourses(req.userId ?? null, location, forceRefresh, {
    searchRadiusKm,
    recommendationType
  });

  // forceRefresh가 실제로 새 계산을 만들었을 수 있으므로, 응답에는 그 이후 남은 횟수를 다시 센다.
  const remainingRefreshes = isLoggedIn
    ? forceRefresh
      ? Math.max(0, DAILY_MANUAL_REFRESH_LIMIT - (await getManualRefreshCountToday(req.userId!)))
      : remainingBefore
    : null;
  const responseBody = { courses, remainingRefreshes };

  if (redis) {
    try {
      if (forceRefresh) {
        // 방금 강제로 새 추천을 받았으니, 캐시에 이전 패널이 남아있으면 다음 일반 조회가 새
        // 결과 대신 stale한 캐시를 돌려준다 — 즉시 지워서 다음 조회에서 새로 채우게 한다.
        await redis.del(cacheKey);
      } else if (!hasInlineFilter) {
        await redis.set(cacheKey, JSON.stringify(responseBody), { expiration: { type: 'EX', value: PANEL_CACHE_TTL_SECONDS } });
      }
    } catch (err) {
      console.error('[ai-recommendations] redis set failed, continuing without cache', err);
    }
  }

  res.json(responseBody);
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
