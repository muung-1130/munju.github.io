import { Router } from 'express';
import {
  applyToExclusiveMarathon,
  applyToMarathon,
  cancelMarathonReservation,
  getMarathonRaceById,
  getMarathonRaces,
  getMarathonRegions,
  getMyReservationsForRaces,
  getRaceCapacityStatus,
  getRegistrationWindow,
  type DistanceBucket
} from '../lib/marathon.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

const VALID_DISTANCE_BUCKETS: DistanceBucket[] = ['KM5', 'KM10', 'KM15', 'HALF', 'FULL'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParam(value: unknown): string | null {
  return typeof value === 'string' && DATE_RE.test(value) ? value : null;
}

router.get('/', async (req, res) => {
  const q = req.query;
  const page = Number(q.page ?? '1');
  const distanceBucketParam = q.distanceBucket;
  const filter = {
    keyword: typeof q.keyword === 'string' ? q.keyword : null,
    region: typeof q.region === 'string' ? q.region : null,
    includeClosed: q.includeClosed === 'true',
    includePast: q.includePast === 'true',
    distanceBucket: VALID_DISTANCE_BUCKETS.includes(distanceBucketParam as DistanceBucket)
      ? (distanceBucketParam as DistanceBucket)
      : null,
    dateFrom: parseDateParam(q.dateFrom),
    dateTo: parseDateParam(q.dateTo),
    page: Number.isInteger(page) && page > 0 ? page : 1
  };

  const [{ races, total, pageSize }, regions] = await Promise.all([getMarathonRaces(filter), getMarathonRegions()]);

  let myReservations: Record<number, { status: string; submittedAt: string }> = {};
  if (req.userId) {
    const map = await getMyReservationsForRaces(
      req.userId,
      races.map((r) => r.raceId)
    );
    myReservations = Object.fromEntries(
      Array.from(map.entries()).map(([raceId, r]) => [raceId, { status: r.status, submittedAt: r.submittedAt }])
    );
  }

  res.json({ races, total, page: filter.page, pageSize, regions, myReservations });
});

router.get('/:raceId', async (req, res) => {
  const raceId = Number(req.params.raceId);
  if (!Number.isInteger(raceId)) {
    res.status(400).json({ error: '잘못된 대회예요.' });
    return;
  }

  const race = await getMarathonRaceById(raceId);
  if (!race) {
    res.status(404).json({ error: '대회를 찾을 수 없어요.' });
    return;
  }

  const [registrationWindow, capacityStatus, myReservationMap] = await Promise.all([
    race.isExclusiveCollab ? getRegistrationWindow(raceId) : Promise.resolve(null),
    race.isExclusiveCollab ? getRaceCapacityStatus(raceId) : Promise.resolve(null),
    req.userId ? getMyReservationsForRaces(req.userId, [raceId]) : Promise.resolve(new Map())
  ]);

  res.json({
    race,
    registrationWindow,
    capacityStatus,
    myReservation: myReservationMap.get(raceId) ?? null
  });
});

const APPLY_RATE_LIMIT = 5;
const APPLY_RATE_WINDOW_MS = 60_000;

router.post('/:raceId/apply', requireAuth, async (req, res) => {
  const raceId = Number(req.params.raceId);
  if (!Number.isInteger(raceId)) {
    res.status(400).json({ error: '잘못된 대회예요.' });
    return;
  }

  const { allowed, retryAfterMs } = checkRateLimit(`marathon-apply:${req.userId}`, APPLY_RATE_LIMIT, APPLY_RATE_WINDOW_MS);
  if (!allowed) {
    res.status(429).json({ error: `요청이 너무 잦아요. ${Math.ceil(retryAfterMs / 1000)}초 후 다시 시도해 주세요.` });
    return;
  }

  const race = await getMarathonRaceById(raceId);
  if (!race) {
    res.status(404).json({ error: '대회를 찾을 수 없어요.' });
    return;
  }

  if (race.isExclusiveCollab) {
    const outcome = await applyToExclusiveMarathon(req.userId!, raceId);
    if (outcome.result === 'race-not-found') {
      res.status(404).json({ error: '대회를 찾을 수 없어요.' });
      return;
    }
    if (outcome.result === 'window-not-open') {
      res.status(409).json({ error: '접수 시작 전이거나 이미 마감됐어요.' });
      return;
    }
    if (outcome.result === 'already-applied') {
      res.status(409).json({ error: '이미 신청한 대회예요.' });
      return;
    }
    res.json({ success: true, status: outcome.status, queueSequenceNo: outcome.queueSequenceNo });
    return;
  }

  const result = await applyToMarathon(req.userId!, raceId);
  if (result === 'race-not-found') {
    res.status(404).json({ error: '대회를 찾을 수 없어요.' });
    return;
  }
  if (result === 'not-open') {
    res.status(409).json({ error: '접수 기간이 아니에요.' });
    return;
  }
  if (result === 'already-applied') {
    res.status(409).json({ error: '이미 신청한 대회예요.' });
    return;
  }
  res.json({ success: true, status: 'CONFIRMED', queueSequenceNo: null });
});

router.post('/:raceId/cancel', requireAuth, async (req, res) => {
  const raceId = Number(req.params.raceId);
  if (!Number.isInteger(raceId)) {
    res.status(400).json({ error: '잘못된 대회예요.' });
    return;
  }

  const cancelled = await cancelMarathonReservation(req.userId!, raceId);
  if (!cancelled) {
    res.status(404).json({ error: '신청 내역을 찾을 수 없어요.' });
    return;
  }
  res.json({ success: true });
});

export default router;
