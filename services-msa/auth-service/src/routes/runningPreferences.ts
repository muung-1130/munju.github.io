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

  try {
    await saveOnboardingPreferences(req.userId!, {
      runningGoal: body.runningGoal ?? null,
      difficulty: body.difficulty ?? null,
      preferredDistanceM: body.preferredDistanceM ? Number(body.preferredDistanceM) : null,
      preferredScenery: body.preferredScenery ?? null,
      searchRadiusM: body.searchRadiusM ? Number(body.searchRadiusM) : null,
      recommendationType: body.recommendationType ?? null
    });
  } catch {
    res.status(500).json({ error: '저장 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.' });
    return;
  }
  res.json({ success: true });
});

export default router;
