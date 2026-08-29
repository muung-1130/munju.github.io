import { Router } from 'express';
import { requireAuth } from '../middleware/session.js';
import {
  MediaNotFoundError,
  MediaOwnershipError,
  completeUpload,
  createUploadSlot,
  discardUpload,
  getMediaWithDownloadUrl,
  type MediaDomainType
} from '../lib/media.js';

const router = Router();

const DOMAIN_TYPES: MediaDomainType[] = ['PROFILE', 'COURSE', 'SHOE', 'CHAT', 'CHALLENGE', 'MARATHON'];
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

function handleKnownErrors(err: unknown, res: import('express').Response): boolean {
  if (err instanceof MediaNotFoundError) {
    res.status(404).json({ error: err.message });
    return true;
  }
  if (err instanceof MediaOwnershipError) {
    res.status(403).json({ error: err.message });
    return true;
  }
  return false;
}

// 브라우저가 직접 오브젝트 스토리지에 PUT할 수 있는 presigned URL을 발급한다.
router.post('/uploads', requireAuth, async (req, res) => {
  const { domainType, contentType, originalFilename, sizeBytes } = req.body ?? {};

  if (!DOMAIN_TYPES.includes(domainType)) {
    res.status(400).json({ error: `domainType은 ${DOMAIN_TYPES.join(', ')} 중 하나여야 해요.` });
    return;
  }
  if (typeof contentType !== 'string' || !contentType.startsWith('image/')) {
    res.status(400).json({ error: '이미지 파일만 업로드할 수 있어요.' });
    return;
  }
  if (typeof originalFilename !== 'string' || originalFilename.length === 0) {
    res.status(400).json({ error: '파일명이 필요해요.' });
    return;
  }
  if (typeof sizeBytes !== 'number' || sizeBytes <= 0 || sizeBytes > MAX_SIZE_BYTES) {
    res.status(400).json({ error: `파일 크기는 1바이트 이상 ${MAX_SIZE_BYTES / 1024 / 1024}MB 이하여야 해요.` });
    return;
  }

  try {
    const slot = await createUploadSlot({
      ownerUserId: req.userId!,
      domainType,
      contentType,
      originalFilename,
      sizeBytes
    });
    res.status(201).json(slot);
  } catch (err) {
    console.error('업로드 슬롯 생성 실패:', err);
    res.status(500).json({ error: '업로드를 준비하지 못했어요.' });
  }
});

router.post('/:mediaId/complete', requireAuth, async (req, res) => {
  try {
    await completeUpload(req.params.mediaId, req.userId!);
    res.json({ success: true, mediaId: req.params.mediaId });
  } catch (err) {
    if (handleKnownErrors(err, res)) return;
    console.error('업로드 완료 처리 실패:', err);
    res.status(500).json({ error: '업로드 완료 처리에 실패했어요.' });
  }
});

router.post('/:mediaId/discard', requireAuth, async (req, res) => {
  try {
    await discardUpload(req.params.mediaId, req.userId!);
    res.json({ success: true });
  } catch (err) {
    if (handleKnownErrors(err, res)) return;
    console.error('업로드 폐기 실패:', err);
    res.status(500).json({ error: '업로드를 폐기하지 못했어요.' });
  }
});

router.get('/:mediaId', requireAuth, async (req, res) => {
  try {
    const media = await getMediaWithDownloadUrl(req.params.mediaId, req.userId!);
    res.json(media);
  } catch (err) {
    if (handleKnownErrors(err, res)) return;
    console.error('미디어 조회 실패:', err);
    res.status(500).json({ error: '미디어 정보를 가져오지 못했어요.' });
  }
});

export default router;
