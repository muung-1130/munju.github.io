import { Router } from 'express';
import { createPendingMediaObjectInternal, discardMediaObjectInternal, markMediaObjectReadyInternal } from '../lib/media.js';

const router = Router();

// 다른 서비스(예: shoe-service)가 자기 버킷/키를 이미 갖고 있고 media.media_objects에는
// 북키핑만 필요할 때 쓰는 서비스 간 전용 경로다 — 브라우저에서는 절대 호출할 일이 없으므로
// 세션이 아니라 공유 비밀값으로 검증한다(running-record-service의 /api/internal/run-completed와 동일한 패턴).
router.use((req, res, next) => {
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
});

router.post('/pending', async (req, res) => {
  const { ownerUserId, domainType, bucketName, objectKey, originalFilename, contentType, sizeBytes } = req.body ?? {};
  if (!ownerUserId || !domainType || !bucketName || !objectKey || !originalFilename || !contentType || typeof sizeBytes !== 'number') {
    res.status(400).json({ error: 'invalid payload' });
    return;
  }
  try {
    const mediaId = await createPendingMediaObjectInternal({
      ownerUserId,
      domainType,
      bucketName,
      objectKey,
      originalFilename,
      contentType,
      sizeBytes
    });
    res.status(201).json({ mediaId });
  } catch (err) {
    console.error('내부 미디어 pending 생성 실패:', err);
    res.status(500).json({ error: 'failed' });
  }
});

router.post('/:mediaId/ready', async (req, res) => {
  try {
    await markMediaObjectReadyInternal(req.params.mediaId);
    res.json({ success: true });
  } catch (err) {
    console.error('내부 미디어 ready 처리 실패:', err);
    res.status(500).json({ error: 'failed' });
  }
});

router.post('/:mediaId/discard', async (req, res) => {
  try {
    await discardMediaObjectInternal(req.params.mediaId);
    res.json({ success: true });
  } catch (err) {
    console.error('내부 미디어 discard 처리 실패:', err);
    res.status(500).json({ error: 'failed' });
  }
});

export default router;
