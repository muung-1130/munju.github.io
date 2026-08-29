import { Router } from 'express';
import { getRunningPreferences, saveOnboardingPreferences } from '../lib/runningPreferences.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();
const GOALS = ['HEALTH', 'DIET', 'ENDURANCE', 'MARATHON'];
const DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const RECOMMENDATION_TYPES = ['location_based', 'distance_based', 'difficulty_based', 'popular_based'];

router.get('/', async (req, res) => {
  if (!req.userId) {
    res.json({ hasPreferences: true, preferences: null });
    return;
  }
  const preferences = await getRunningPreferences(req.userId);
  res.json({ hasPreferences: preferences !== null, preferences });
});

router.post('/', requireAuth, async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: '요청 형식이 올바르지 않아요.' });
    return;
  }
  if (body.runningGoal && !GOALS.includes(body.runningGoal)) {
    res.status(400).json({ error: '러닝 목표 값이 올바르지 않아요.' });
    return;
  }
  if (body.difficulty && !DIFFICULTIES.includes(body.difficulty)) {
    res.status(400).json({ error: '숙련도 값이 올바르지 않아요.' });
    return;
  }
  if (body.recommendationType && !RECOMMENDATION_TYPES.includes(body.recommendationType)) {
    res.status(400).json({ error: '추천 기준 값이 올바르지 않아요.' });
    return;
  }
  if (body.searchRadiusM !== undefined && body.searchRadiusM !== null && !(Number(body.searchRadiusM) > 0)) {
    res.status(400).json({ error: '검색 반경 값이 올바르지 않아요.' });
    return;
  }

  // 요청 body에 아예 없는 필드는 saveOnboardingPreferences에 undefined로 넘겨서 기존 저장값을
  // 그대로 둔다 — AI 추천 패널처럼 반경/추천기준 두 개만 보내는 부분 저장 요청이, 여기 없는
  // 러닝목표/숙련도/거리/환경 값을 지우지 않게 하기 위함(선호도 설문 모달은 항상 4개를 전부
  // 같이 보내므로 그 쪽 동작은 그대로다).
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  try {
    await saveOnboardingPreferences(req.userId!, {
      runningGoal: has('runningGoal') ? body.runningGoal ?? null : undefined,
      difficulty: has('difficulty') ? body.difficulty ?? null : undefined,
      preferredDistanceM: has('preferredDistanceM') ? (body.preferredDistanceM ? Number(body.preferredDistanceM) : null) : undefined,
      preferredScenery: has('preferredScenery') ? body.preferredScenery ?? null : undefined,
      searchRadiusM: has('searchRadiusM') ? (body.searchRadiusM ? Number(body.searchRadiusM) : null) : undefined,
      recommendationType: has('recommendationType') ? body.recommendationType ?? null : undefined
    });
  } catch {
    res.status(500).json({ error: '저장 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.' });
    return;
  }
  res.json({ success: true });
});

export default router;
