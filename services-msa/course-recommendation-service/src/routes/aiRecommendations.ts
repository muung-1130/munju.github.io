import type { Request } from 'express';
import type { RedisClientType } from 'redis';
import { Router } from 'express';
import { FEEDBACK_TYPES, getAiRecoPanelCourses, recordRecommendationFeedback } from '../lib/aiRecommendation.js';
import { DAILY_MANUAL_REFRESH_LIMIT, getManualRefreshCountToday } from '../lib/aiRecommendationOrchestrator.js';
import { getRedisClient } from '../../../shared/redis.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();
const RECOMMENDATION_TYPES = ['location_based', 'distance_based', 'difficulty_based', 'popular_based'];

function parsePanelLocation(req: Request): { latitude: number; longitude: number } | undefined {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    ? { latitude: lat, longitude: lng }
    : undefined;
}

type PanelFilters = {
  isLoggedIn: boolean;
  searchRadiusKm: number | undefined;
  recommendationType: string | undefined;
  forceRefreshRequested: boolean;
  hasInlineFilter: boolean;
};

// forceRefresh("AI 추천 다시 받기" 버튼)와 반경/추천기준 필터는 로그인 사용자만 의미가 있다 —
// 비로그인/게스트는 전원이 공유하는 공용 기본 추천이라 한 사람이 강제로 새로고침하면 다른 모든
// 게스트의 결과까지 바뀌게 되므로 여기서 무시한다.
function parsePanelFilters(req: Request): PanelFilters {
  const isLoggedIn = Boolean(req.userId);
  const radiusKmRaw = Number(req.query.radiusKm);
  const searchRadiusKm = isLoggedIn && Number.isFinite(radiusKmRaw) && radiusKmRaw > 0 && radiusKmRaw <= 10 ? radiusKmRaw : undefined;
  const recommendationTypeRaw = typeof req.query.recommendationType === 'string' ? req.query.recommendationType : undefined;
  const recommendationType =
    isLoggedIn && recommendationTypeRaw && RECOMMENDATION_TYPES.includes(recommendationTypeRaw) ? recommendationTypeRaw : undefined;
  const forceRefreshRequested = req.query.forceRefresh === 'true' && isLoggedIn;
  const hasInlineFilter = Boolean(searchRadiusKm || recommendationType);
  return { isLoggedIn, searchRadiusKm, recommendationType, forceRefreshRequested, hasInlineFilter };
}

async function countRemainingRefreshes(userId: string): Promise<number> {
  return Math.max(0, DAILY_MANUAL_REFRESH_LIMIT - (await getManualRefreshCountToday(userId)));
}
// 추천 결과 자체는 하루 1회(KST 03:00 기준)만 재계산되므로(ensureTodaysRecommendation) 패널 응답을
// 몇 분 캐시해도 오늘의 추천이 바뀌는 일은 없다 — DB/Bedrock 재계산이 아니라 "홈/코스탐색 페이지를
// 새로고침할 때마다 반복되는 조회"만 줄이는 목적이다(redis-usage-guide 코스 추천 패널 TTL 권장 5~15분).
const PANEL_CACHE_TTL_SECONDS = 300;

type PanelResponseBody = { courses: unknown; remainingRefreshes: number | null };

async function readPanelCache(redis: RedisClientType | null, cacheKey: string): Promise<PanelResponseBody | null> {
  if (!redis) return null;
  try {
    const cached = await redis.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    console.error('[ai-recommendations] redis get failed, falling back to DB', err);
    return null;
  }
}

// forceRefresh 직후엔 방금 새로 계산된 결과를 다음 조회가 바로 보게 캐시를 지운다. 그 외의
// 일반 조회는 채워서 5분간 재사용하되, 반경/추천기준 필터가 걸린 응답은 그 사람만의 일시적인
// 조건이라 공용 패널 캐시로 남기지 않는다.
async function writePanelCache(
  redis: RedisClientType | null,
  cacheKey: string,
  { forceRefresh, hasInlineFilter }: { forceRefresh: boolean; hasInlineFilter: boolean },
  responseBody: PanelResponseBody
): Promise<void> {
  if (!redis) return;
  try {
    if (forceRefresh) {
      await redis.del(cacheKey);
    } else if (!hasInlineFilter) {
      await redis.set(cacheKey, JSON.stringify(responseBody), { expiration: { type: 'EX', value: PANEL_CACHE_TTL_SECONDS } });
    }
  } catch (err) {
    console.error('[ai-recommendations] redis set failed, continuing without cache', err);
  }
}

// app/page.tsx, app/courses/page.tsx가 SSR 중에 직접 함수를 부르는 대신 이 엔드포인트를
// fetch한다(Next.js가 세션 쿠키를 그대로 넘겨준다). SSR 시점엔 브라우저 GPS를 알 수 없어
// lat/lng 없이 호출되고, AiRecoPanel이 마운트된 뒤 실제 위치를 얻으면 lat/lng을 붙여 다시
// 호출한다 — 오늘 추천이 이미 계산돼 있으면 ensureTodaysRecommendation이 하루 1회 제한으로
// 이 좌표를 무시하고 기존 결과를 그대로 돌려준다.
//
// 반경/추천기준 버튼은 더 이상 누르는 즉시 재조회하지 않는다 — 사용자가 값을 고른 뒤
// "AI 추천 다시 받기"를 눌러야만(forceRefresh=true) 그 값으로 실제 재계산이 일어난다.
router.get('/panel', async (req, res) => {
  const location = parsePanelLocation(req);
  const { isLoggedIn, searchRadiusKm, recommendationType, forceRefreshRequested, hasInlineFilter } = parsePanelFilters(req);
  const cacheKey = `course-recommendation:panel:${req.userId ?? 'guest'}`;
  const redis = await getRedisClient();

  // forceRefresh나 반경/추천기준 필터는 그 자체가 "지금 이 값으로 다시 계산해줘"라는 명시적
  // 요청이라 캐시를 건너뛴다(redis-usage-guide §5, §6).
  const cached = forceRefreshRequested || hasInlineFilter ? null : await readPanelCache(redis, cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const remainingBefore = isLoggedIn ? await countRemainingRefreshes(req.userId!) : 0;
  // 하루 사용 횟수를 다 썼으면 forceRefresh 요청이 와도 서버에서 무시한다(버튼 비활성/팝업은
  // 프론트가 처리하지만, 직접 API를 호출하는 우회도 막기 위해 여기서도 한 번 더 막는다).
  const forceRefresh = forceRefreshRequested && remainingBefore > 0;

  const courses = await getAiRecoPanelCourses(req.userId ?? null, location, forceRefresh, {
    searchRadiusKm,
    recommendationType
  });

  // forceRefresh가 실제로 새 계산을 만들었을 수 있으므로, 응답에는 그 이후 남은 횟수를 다시 센다.
  const remainingRefreshes = !isLoggedIn ? null : forceRefresh ? await countRemainingRefreshes(req.userId!) : remainingBefore;
  const responseBody = { courses, remainingRefreshes };
  await writePanelCache(redis, cacheKey, { forceRefresh, hasInlineFilter }, responseBody);
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
