import { Router } from 'express';
import { getRunningStatsByPeriod, type StatPeriod } from '../lib/runningRecord.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

router.get('/running-stats', requireAuth, async (req, res) => {
  const periodParam = req.query.period;
  const period: StatPeriod = periodParam === 'year' || periodParam === 'month' ? periodParam : 'week';
  const stats = await getRunningStatsByPeriod(req.userId!, period);
  res.json(stats);
});

export default router;
