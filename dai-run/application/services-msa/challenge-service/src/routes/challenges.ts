import { Router } from 'express';
import {
  ChallengeValidationError,
  createChallenge,
  deletePersonalChallenge,
  getChallengeDailyLog,
  getChallengeDetail,
  getHallOfFame,
  getLiveParticipants,
  getPersonalChallenges,
  getPublicChallenges,
  joinPublicChallenge,
  leavePublicChallenge
} from '../lib/challenges.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

router.get('/', async (req, res) => {
  const userId = req.userId ?? null;
  // 챌린지 진행도는 challenge-service의 RunCompleted 컨슈머(src/consumer.ts)가 유일하게 갱신한다.
  // 예전에는 이 조회 시점에도 syncUserChallengeProgress로 지연 동기화를 했는데, 컨슈머와 서로
  // 다른 멱등키(run_id vs eventId)를 써서 같은 러닝이 이중으로 반영될 수 있는 버그가 있었다.

  const [personal, publicChallenges] = await Promise.all([
    userId ? getPersonalChallenges(userId) : Promise.resolve([]),
    getPublicChallenges(userId)
  ]);
  res.json({ personal, public: publicChallenges });
});

router.post('/', requireAuth, async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: '요청 형식이 올바르지 않아요.' });
    return;
  }
  if (body.challengeType !== 'PERSONAL' && body.challengeType !== 'PUBLIC') {
    res.status(400).json({ error: '챌린지 유형을 선택해 주세요.' });
    return;
  }
  if (!['DISTANCE', 'COUNT', 'PACE', 'STREAK'].includes(body.metricType)) {
    res.status(400).json({ error: '목표 지표를 선택해 주세요.' });
    return;
  }

  try {
    const challengeId = await createChallenge(req.userId!, {
      challengeType: body.challengeType,
      name: String(body.name ?? ''),
      description: body.description ? String(body.description) : null,
      metricType: body.metricType,
      targetValue: Number(body.targetValue),
      startAt: String(body.startAt ?? ''),
      endAt: String(body.endAt ?? ''),
      rules: body.rules ?? null
    });
    res.status(201).json({ challengeId });
  } catch (error) {
    if (error instanceof ChallengeValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('create challenge failed', error);
    res.status(500).json({ error: '챌린지를 만들 수 없어요.' });
  }
});

router.get('/:challengeId', async (req, res) => {
  const userId = req.userId ?? null;
  const detail = await getChallengeDetail(req.params.challengeId, userId);
  if (!detail) {
    res.status(404).json({ error: '챌린지를 찾을 수 없어요.' });
    return;
  }
  const dailyLog = userId && detail.myStatus ? await getChallengeDailyLog(req.params.challengeId, userId) : [];
  res.json({ challenge: detail, dailyLog });
});

router.delete('/:challengeId', requireAuth, async (req, res) => {
  const result = await deletePersonalChallenge(req.params.challengeId, req.userId!);
  if (result === 'not-found') {
    res.status(404).json({ error: '삭제할 수 있는 개인 챌린지가 아니에요.' });
    return;
  }
  res.json({ success: true });
});

router.post('/:challengeId/join', requireAuth, async (req, res) => {
  const result = await joinPublicChallenge(req.params.challengeId, req.userId!);
  if (result === 'not-found') {
    res.status(404).json({ error: '참여할 수 없는 챌린지예요.' });
    return;
  }
  if (result === 'already-joined') {
    res.status(409).json({ error: '이미 참여 중인 챌린지예요.' });
    return;
  }
  res.json({ success: true, waiting: result === 'ok-waiting' });
});

router.post('/:challengeId/leave', requireAuth, async (req, res) => {
  const result = await leavePublicChallenge(req.params.challengeId, req.userId!);
  if (result === 'not-joined') {
    res.status(404).json({ error: '참여 중인 챌린지가 아니에요.' });
    return;
  }
  res.json({ success: true });
});

router.get('/:challengeId/participants', async (req, res) => {
  const [participants, hallOfFame] = await Promise.all([
    getLiveParticipants(req.params.challengeId),
    getHallOfFame(req.params.challengeId)
  ]);
  res.json({ participants, hallOfFame });
});

export default router;
