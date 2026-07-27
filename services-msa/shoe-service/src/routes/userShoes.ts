import { Router } from 'express';
import multer from 'multer';
import { getPool } from '../lib/db.js';
import {
  ShoeOwnershipError,
  WEAR_IMAGE_ROLES,
  type WearImageRole,
  requestShoeWearAnalysis
} from '../lib/shoeWearAnalysis.js';
import { getLatestWearAnalysisResult, getWearAnalysisResult } from '../lib/shoes.js';
import {
  UserShoeOwnershipError,
  UserShoeValidationError,
  createUserShoe,
  getActiveUserShoeOptions,
  getEditableUserShoe,
  retireUserShoe,
  setCustomThumbnailKey,
  updateUserShoe
} from '../lib/userShoes.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const SHOE_LIFE_AI_URL = process.env.SHOE_LIFE_AI_SERVICE_URL ?? 'http://192.168.0.201:8002';
const MEDIA_PROXY_SECRET = process.env.SHOE_LIFE_MEDIA_PROXY_SECRET ?? '';
const ALLOWED_PHOTO_ROLES = new Set(['left_outsole', 'right_outsole', 'heels', 'left_side', 'right_side']);
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp']);

router.post('/', requireAuth, async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: '요청 형식이 올바르지 않아요.' });
    return;
  }
  try {
    const userShoeId = await createUserShoe(req.userId!, {
      shoeModelId: body.shoeModelId === null || body.shoeModelId === undefined ? null : Number(body.shoeModelId),
      nickname: body.nickname ? String(body.nickname) : null,
      purchaseDate: String(body.purchaseDate ?? '')
    });
    res.status(201).json({ userShoeId });
  } catch (error) {
    if (error instanceof UserShoeValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('create user shoe failed', error);
    res.status(500).json({ error: '러닝화를 등록할 수 없어요.' });
  }
});

router.get('/active-options', async (req, res) => {
  if (!req.userId) {
    res.json({ shoes: [] });
    return;
  }
  const shoes = await getActiveUserShoeOptions(req.userId);
  res.json({ shoes });
});

router.get('/:userShoeId', requireAuth, async (req, res) => {
  const shoe = await getEditableUserShoe(req.userId!, req.params.userShoeId);
  if (!shoe) {
    res.status(404).json({ error: '신발을 찾을 수 없어요.' });
    return;
  }
  res.json({ shoe });
});

router.patch('/:userShoeId', requireAuth, async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: '요청 형식이 올바르지 않아요.' });
    return;
  }
  try {
    await updateUserShoe(req.userId!, req.params.userShoeId, {
      shoeModelId: body.shoeModelId === null || body.shoeModelId === undefined ? null : Number(body.shoeModelId),
      nickname: body.nickname ? String(body.nickname) : null,
      purchaseDate: String(body.purchaseDate ?? '')
    });
    res.json({ success: true });
  } catch (error) {
    if (error instanceof UserShoeValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof UserShoeOwnershipError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('update user shoe failed', error);
    res.status(500).json({ error: '러닝화를 수정할 수 없어요.' });
  }
});

router.post('/:userShoeId/retire', requireAuth, async (req, res) => {
  try {
    await retireUserShoe(req.userId!, req.params.userShoeId);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof UserShoeOwnershipError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('retire user shoe failed', error);
    res.status(500).json({ error: '러닝화를 버릴 수 없어요.' });
  }
});

router.get('/:userShoeId/thumbnail', requireAuth, async (req, res) => {
  const pool = getPool();
  const { rows } = await pool.query<{ custom_thumbnail_key: string | null }>(
    `SELECT custom_thumbnail_key FROM shoe.user_shoes WHERE user_shoe_id = $1 AND user_id = $2`,
    [req.params.userShoeId, req.userId]
  );
  const key = rows[0]?.custom_thumbnail_key;
  if (!key) {
    res.status(404).json({ error: '썸네일이 없어요.' });
    return;
  }
  try {
    const presignedRes = await fetch(`${SHOE_LIFE_AI_URL}/api/media/presigned-url?key=${encodeURIComponent(key)}`, {
      headers: { 'x-media-proxy-secret': MEDIA_PROXY_SECRET }
    });
    if (!presignedRes.ok) {
      res.status(502).json({ error: '썸네일을 불러올 수 없어요.' });
      return;
    }
    const data = await presignedRes.json();
    res.redirect(data.url);
  } catch (error) {
    console.error('thumbnail presigned-url fetch failed', error);
    res.status(502).json({ error: '썸네일을 불러올 수 없어요.' });
  }
});

router.get('/:userShoeId/wear-analysis/latest', requireAuth, async (req, res) => {
  const result = await getLatestWearAnalysisResult(req.params.userShoeId, req.userId!);
  res.json({ result: result ?? null });
});

router.get('/:userShoeId/wear-analysis/:wearAnalysisId', requireAuth, async (req, res) => {
  const result = await getWearAnalysisResult(req.params.wearAnalysisId, req.params.userShoeId, req.userId!);
  if (!result) {
    res.status(404).json({ error: '분석 결과를 찾을 수 없어요.' });
    return;
  }
  res.json({ result });
});

router.get('/:userShoeId/wear-analysis/:wearAnalysisId/photo', requireAuth, async (req, res) => {
  const role = req.query.role;
  if (typeof role !== 'string' || !ALLOWED_PHOTO_ROLES.has(role)) {
    res.status(400).json({ error: '허용되지 않은 role입니다.' });
    return;
  }
  const pool = getPool();
  const { rows } = await pool.query<{ result_json: { storage?: { image_keys?: Record<string, string> } } | null }>(
    `SELECT wa.result_json
       FROM shoe.shoe_wear_analyses wa
       JOIN shoe.user_shoes us ON us.user_shoe_id = wa.user_shoe_id
      WHERE wa.wear_analysis_id = $1 AND wa.user_shoe_id = $2 AND us.user_id = $3`,
    [req.params.wearAnalysisId, req.params.userShoeId, req.userId]
  );
  const key = rows[0]?.result_json?.storage?.image_keys?.[role];
  if (!key) {
    res.status(404).json({ error: '사진을 찾을 수 없어요.' });
    return;
  }
  try {
    const presignedRes = await fetch(`${SHOE_LIFE_AI_URL}/api/media/presigned-url?key=${encodeURIComponent(key)}`, {
      headers: { 'x-media-proxy-secret': MEDIA_PROXY_SECRET }
    });
    if (!presignedRes.ok) {
      res.status(502).json({ error: '사진을 불러올 수 없어요.' });
      return;
    }
    const data = await presignedRes.json();
    res.redirect(data.url);
  } catch (error) {
    console.error('wear-analysis photo presigned-url fetch failed', error);
    res.status(502).json({ error: '사진을 불러올 수 없어요.' });
  }
});

const uploadFields = WEAR_IMAGE_ROLES.map((role) => ({ name: role, maxCount: 1 }));

router.post('/:userShoeId/wear-analysis', requireAuth, upload.fields(uploadFields), async (req, res) => {
  const purchaseDate = req.body.purchase_date;
  if (typeof purchaseDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    res.status(400).json({ error: '구매일을 YYYY-MM-DD 형식으로 입력해 주세요.' });
    return;
  }

  const filesByField = req.files as Record<string, Express.Multer.File[]> | undefined;
  const images: Partial<Record<WearImageRole, { buffer: Buffer; filename: string; contentType: string }>> = {};
  for (const role of WEAR_IMAGE_ROLES) {
    const file = filesByField?.[role]?.[0];
    if (!file) {
      res.status(400).json({ error: `${role} 사진이 없어요. 5장을 모두 업로드해 주세요.` });
      return;
    }
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      res.status(400).json({ error: 'JPG, PNG, WebP 파일만 업로드할 수 있어요.' });
      return;
    }
    images[role] = { buffer: file.buffer, filename: file.originalname || `${role}.jpg`, contentType: file.mimetype };
  }

  try {
    const { httpStatus, body } = await requestShoeWearAnalysis({
      userId: req.userId!,
      userShoeId: req.params.userShoeId,
      purchaseDate,
      images: images as Record<WearImageRole, { buffer: Buffer; filename: string; contentType: string }>
    });
    if (httpStatus >= 500) {
      res.status(502).json({ error: body?.detail ?? 'AI 분석 서비스 오류가 발생했어요.' });
      return;
    }
    if (httpStatus >= 400) {
      res.status(httpStatus).json({ error: body?.detail ?? '요청을 처리할 수 없어요.' });
      return;
    }

    if (body?.status === 'COMPLETED') {
      const thumbnailKey = body?.storage?.image_keys?.left_side;
      if (thumbnailKey) {
        const shoe = await getEditableUserShoe(req.userId!, req.params.userShoeId);
        if (shoe && shoe.shoeModelId === null) {
          await setCustomThumbnailKey(req.params.userShoeId, thumbnailKey);
        }
      }
    }

    res.json(body);
  } catch (error) {
    if (error instanceof ShoeOwnershipError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('shoe wear analysis failed', error);
    res.status(502).json({ error: 'AI 분석 서비스에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.' });
  }
});

export default router;
