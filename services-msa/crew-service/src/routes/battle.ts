import { Router } from 'express';
import { isActiveCrewMember } from '../lib/crew.js';
import {
  castVote,
  getBattleCandidates,
  getBattleHistory,
  getBattleView,
  getCrewBattleInfo,
  getPendingBattleView,
  leaderDecide,
  leaveBattle,
  proposeBattle,
  type BattleMetricType
} from '../lib/crewBattle.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

router.get('/:crewId/battle/info', async (req, res) => {
  const metric = req.query.metric;
  const metricType: BattleMetricType = metric === 'PACE' ? 'PACE' : 'DISTANCE';
  const info = await getCrewBattleInfo(req.params.crewId, metricType);
  if (!info) {
    res.status(404).json({ error: '크루를 찾을 수 없어요.' });
    return;
  }
  res.json({ info });
});

router.post('/:crewId/battle/propose', requireAuth, async (req, res) => {
  if (!(await isActiveCrewMember(req.params.crewId, req.userId!))) {
    res.status(403).json({ error: '이 크루의 멤버만 제안할 수 있어요.' });
    return;
  }

  const { opponentCrewId, metricType } = req.body;
  if (typeof opponentCrewId !== 'string' || (metricType !== 'DISTANCE' && metricType !== 'PACE')) {
    res.status(400).json({ error: '요청이 올바르지 않아요.' });
    return;
  }

  const result = await proposeBattle(req.params.crewId, opponentCrewId, metricType as BattleMetricType, req.userId!);
  if (result === 'already-in-battle' || result === 'opponent-unavailable') {
    res.status(409).json({ error: '투표중인 배틀이 이미 있습니다!' });
    return;
  }
  res.json({ success: true, battleId: result.battleId });
});

router.get('/:crewId/battle/view', requireAuth, async (req, res) => {
  if (!(await isActiveCrewMember(req.params.crewId, req.userId!))) {
    res.status(403).json({ error: '이 크루의 멤버만 볼 수 있어요.' });
    return;
  }

  const active = await getBattleView(req.params.crewId, req.userId!);
  if (active) {
    res.json({ pending: null, active, recommendations: null });
    return;
  }

  const pending = await getPendingBattleView(req.params.crewId, req.userId!);
  if (pending) {
    res.json({ pending, active: null, recommendations: null });
    return;
  }

  const [distance, pace] = await Promise.all([
    getBattleCandidates(req.params.crewId, 'DISTANCE'),
    getBattleCandidates(req.params.crewId, 'PACE')
  ]);
  res.json({ pending: null, active: null, recommendations: { distance, pace } });
});

router.get('/:crewId/battle/history', requireAuth, async (req, res) => {
  if (!(await isActiveCrewMember(req.params.crewId, req.userId!))) {
    res.status(403).json({ error: '이 크루의 멤버만 볼 수 있어요.' });
    return;
  }
  const from = typeof req.query.from === 'string' ? req.query.from : null;
  const to = typeof req.query.to === 'string' ? req.query.to : null;
  const history = await getBattleHistory(req.params.crewId, from, to);
  res.json({ history });
});

router.post('/:crewId/battle/leave', requireAuth, async (req, res) => {
  const ok = await leaveBattle(req.params.crewId, req.userId!);
  if (!ok) {
    res.status(403).json({ error: '크루장만 배틀에서 나갈 수 있어요.' });
    return;
  }
  res.json({ success: true });
});

router.post('/battle/:battleId/vote', requireAuth, async (req, res) => {
  const vote = req.body.vote;
  if (vote !== 'AGREE' && vote !== 'DISAGREE') {
    res.status(400).json({ error: '요청이 올바르지 않아요.' });
    return;
  }
  const tally = await castVote(req.params.battleId, req.userId!, vote);
  if (!tally) {
    res.status(403).json({ error: '투표할 수 없어요.' });
    return;
  }
  res.json({ success: true, tally });
});

router.post('/battle/:battleId/decide', requireAuth, async (req, res) => {
  const ok = await leaderDecide(req.params.battleId, req.userId!, Boolean(req.body.approve));
  if (!ok) {
    res.status(403).json({ error: '크루장만 결정할 수 있어요.' });
    return;
  }
  res.json({ success: true });
});

export default router;
