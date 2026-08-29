import { Router } from 'express';
import { cancelRun, finishRun, saveRunSamples, startRun, type RunSampleInput } from '../lib/runTracking.js';
import { getRunRouteForRecommendation } from '../lib/runningRecord.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

// course.courses는 Course 서비스 소유라 여기서 직접 DB를 조회하지 않고, 그 서비스의
// 경량 조회 API를 호출한다(러닝 도메인이 코스 스키마를 직접 들여다보지 않도록 하는 경계).
const COURSE_SERVICE_URL = process.env.COURSE_SERVICE_URL ?? 'http://course-service:4000';

router.post('/start', requireAuth, async (req, res) => {
  const body = req.body;
  const courseId = typeof body.courseId === 'string' ? body.courseId : null;

  // courseId가 없으면 특정 코스를 따라가지 않는 자율 달리기다 — 이 경우 코스 조회 없이 바로 시작한다.
  if (!courseId) {
    const runId = await startRun(req.userId!, null);
    res.json({ runId, course: null });
    return;
  }

  let course: { courseId: string; courseName: string; distanceM: number; positions: [number, number][] } | null = null;
  try {
    const courseRes = await fetch(`${COURSE_SERVICE_URL}/api/courses/${courseId}/track-info`);
    if (courseRes.ok) {
      const data = await courseRes.json();
      course = data.course;
    }
  } catch (err) {
    console.error('course-service 조회 실패:', err);
  }

  if (!course || course.positions.length < 2) {
    res.status(404).json({ error: '이 코스는 경로 정보가 없어 트래킹할 수 없어요.' });
    return;
  }

  const runId = await startRun(req.userId!, courseId);
  res.json({ runId, course });
});

// Course 서비스가 "이 러닝을 코스로 추천하기" 요청을 받으면, 원 요청의 세션 쿠키를 그대로 들고
// 이 엔드포인트를 호출해서 본인 소유 러닝의 경로만 받아간다(서비스 간 직접 DB 조회 금지 원칙).
router.get('/:runId/route-info', requireAuth, async (req, res) => {
  const route = await getRunRouteForRecommendation(req.params.runId, req.userId!);
  if (!route) {
    res.status(404).json({ error: '코스로 추천할 수 있는 러닝 기록이 아니에요.' });
    return;
  }
  res.json(route);
});

router.post('/:runId/finish', requireAuth, async (req, res) => {
  const body = req.body;
  const status = body.status === 'STOPPED' ? 'STOPPED' : body.status === 'COMPLETED' ? 'COMPLETED' : null;
  const sourceType = body.sourceType === 'MANUAL' ? 'MANUAL' : 'APP';
  const distanceM = Number(body.distanceM);
  const durationSec = Number(body.durationSec);
  const movingDurationSec = Number(body.movingDurationSec ?? body.durationSec);
  const avgPaceSecPerKm = body.avgPaceSecPerKm === null || body.avgPaceSecPerKm === undefined ? null : Math.round(Number(body.avgPaceSecPerKm));
  const bestPaceSecPerKm = body.bestPaceSecPerKm === null || body.bestPaceSecPerKm === undefined ? null : Math.round(Number(body.bestPaceSecPerKm));
  const routePositions: [number, number][] = Array.isArray(body.routePositions)
    ? body.routePositions.filter((p: unknown) => Array.isArray(p) && p.length === 2)
    : [];
  const myShoeId = typeof body.myShoeId === 'string' && body.myShoeId.trim() ? body.myShoeId : null;

  if (!status || !Number.isFinite(distanceM) || distanceM < 0 || !Number.isFinite(durationSec) || durationSec < 0) {
    res.status(400).json({ error: '기록 정보가 올바르지 않아요.' });
    return;
  }

  try {
    await finishRun(req.params.runId, req.userId!, {
      status,
      sourceType,
      distanceM: Math.round(distanceM),
      durationSec: Math.round(durationSec),
      movingDurationSec: Math.round(movingDurationSec),
      avgPaceSecPerKm,
      bestPaceSecPerKm,
      routePositions,
      myShoeId
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '기록 저장에 실패했어요.' });
  }
});

router.post('/:runId/cancel', requireAuth, async (req, res) => {
  await cancelRun(req.params.runId, req.userId!);
  res.json({ success: true });
});

router.post('/:runId/samples', requireAuth, async (req, res) => {
  const rawSamples = Array.isArray(req.body.samples) ? req.body.samples : [];
  const samples: RunSampleInput[] = rawSamples
    .filter((s: unknown): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s: Record<string, unknown>) => ({
      lat: Number(s.lat),
      lng: Number(s.lng),
      recordedAt: typeof s.recordedAt === 'string' ? s.recordedAt : new Date().toISOString(),
      paceSecPerKm: s.paceSecPerKm === null || s.paceSecPerKm === undefined ? null : Number(s.paceSecPerKm),
      accuracyM: s.accuracyM === null || s.accuracyM === undefined ? null : Number(s.accuracyM),
      speedMps: s.speedMps === null || s.speedMps === undefined ? null : Number(s.speedMps)
    }))
    .filter((s: RunSampleInput) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

  try {
    await saveRunSamples(req.params.runId, req.userId!, samples);
    res.json({ success: true, saved: samples.length });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '샘플 저장에 실패했어요.' });
  }
});

export default router;
