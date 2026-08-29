import { Router } from 'express';
import {
  getRecommendedShoes,
  getShoeFilterOptions,
  getShoeLikeState,
  getUserShoePreferences,
  getUserShoesDetailed,
  saveUserShoePreferences,
  searchShoeCatalog,
  searchShoeCatalogForPicker,
  toggleShoeLike
} from '../lib/shoes.js';
import { searchShoeCatalogElasticsearch } from '../lib/shoeSearch.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();
const PAGE_SIZE = 24;

router.get('/', async (req, res) => {
  const q = req.query;
  const offset = Math.max(0, Number(q.offset ?? '0') || 0);
  const carbonPlateParam = q.carbonPlate;
  const filter = {
    q: typeof q.q === 'string' ? q.q : null,
    brand: typeof q.brand === 'string' ? q.brand : null,
    purpose: typeof q.purpose === 'string' ? q.purpose : null,
    recommendLevel: typeof q.recommendLevel === 'string' ? q.recommendLevel : null,
    footWidth: typeof q.footWidth === 'string' ? q.footWidth : null,
    carbonPlate: carbonPlateParam === 'true' ? true : carbonPlateParam === 'false' ? false : null,
    priceMin: q.priceMin ? Number(q.priceMin) : null,
    priceMax: q.priceMax ? Number(q.priceMax) : null,
    sort: (q.sort as 'popular' | 'price_asc' | 'price_desc' | 'score' | null) ?? 'popular',
    limit: PAGE_SIZE,
    offset
  };

  const useElasticsearch = q.engine === 'elasticsearch';
  const searchFunction = useElasticsearch ? searchShoeCatalogElasticsearch : searchShoeCatalog;
  const { shoes, total } = await searchFunction(filter, req.userId ?? null);

  res.json({
    engine: useElasticsearch ? 'elasticsearch' : 'postgres',
    shoes,
    total,
    hasMore: offset + shoes.length < total
  });
});

router.get('/catalog-search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const shoes = await searchShoeCatalogForPicker(query);
  res.json({ shoes });
});

router.get('/recommendations', async (req, res) => {
  const shoes = await getRecommendedShoes(req.userId ?? null);
  res.json({ shoes });
});

router.get('/mine', async (req, res) => {
  if (!req.userId) {
    res.json({ shoes: [] });
    return;
  }
  const shoes = await getUserShoesDetailed(req.userId);
  res.json({ shoes });
});

router.get('/preferences', requireAuth, async (req, res) => {
  const preferences = await getUserShoePreferences(req.userId!);
  res.json({ preferences });
});

const FOOT_TYPES = ['좁음', '보통', '넓음'];

function toScale1to5(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

function toNonNegativeIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

router.post('/preferences', requireAuth, async (req, res) => {
  const body = req.body;
  const cushionPreference = toScale1to5(body.cushionPreference);
  const gripPreference = toScale1to5(body.gripPreference);
  const stabilityPreference = toScale1to5(body.stabilityPreference);
  const responsivenessPreference = toScale1to5(body.responsivenessPreference);
  const distancePreference = toScale1to5(body.distancePreference);
  const footType = typeof body.footType === 'string' && FOOT_TYPES.includes(body.footType) ? body.footType : null;
  const budgetMin = toNonNegativeIntOrNull(body.budgetMin);
  const budgetMax = toNonNegativeIntOrNull(body.budgetMax);

  if (
    cushionPreference === null ||
    gripPreference === null ||
    stabilityPreference === null ||
    responsivenessPreference === null ||
    distancePreference === null
  ) {
    res.status(400).json({ error: '선호도 값이 올바르지 않아요.' });
    return;
  }
  if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
    res.status(400).json({ error: '예산 범위를 확인해주세요.' });
    return;
  }

  await saveUserShoePreferences(req.userId!, {
    cushionPreference,
    gripPreference,
    stabilityPreference,
    responsivenessPreference,
    distancePreference,
    footType,
    budgetMin,
    budgetMax
  });
  res.json({ success: true });
});

router.get('/filters', async (_req, res) => {
  const options = await getShoeFilterOptions();
  res.json(options);
});

router.get('/:shoeId/like', async (req, res) => {
  const shoeId = Number(req.params.shoeId);
  if (!Number.isInteger(shoeId)) {
    res.status(400).json({ error: '잘못된 러닝화예요.' });
    return;
  }
  const state = await getShoeLikeState(shoeId, req.userId ?? null);
  res.json(state);
});

router.post('/:shoeId/like', requireAuth, async (req, res) => {
  const shoeId = Number(req.params.shoeId);
  if (!Number.isInteger(shoeId)) {
    res.status(400).json({ error: '잘못된 러닝화예요.' });
    return;
  }
  const state = await toggleShoeLike(shoeId, req.userId!);
  res.json(state);
});

export default router;
