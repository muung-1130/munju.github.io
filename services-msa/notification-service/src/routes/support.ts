import { Router } from 'express';
import { createInquiry, getInquiryDetail, getInquiryList, replyToInquiry } from '../lib/support.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  const inquiries = await getInquiryList();
  res.json({ inquiries });
});

router.post('/', requireAuth, async (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (!title || title.length > 200) {
    res.status(400).json({ error: '제목을 200자 이내로 입력해주세요.' });
    return;
  }
  if (!content) {
    res.status(400).json({ error: '문의 내용을 입력해주세요.' });
    return;
  }
  const inquiryId = await createInquiry(req.userId!, title, content);
  res.json({ success: true, inquiryId });
});

// 문의 내용은 작성자 본인과 admin 계정만 볼 수 있다. 이 서비스에는 별도 role 컬럼이 없어서
// user_name === 'admin'을 관리자로 취급한다(지금까지 이 계정을 그렇게 써왔음).
router.get('/:inquiryId', requireAuth, async (req, res) => {
  const inquiry = await getInquiryDetail(req.params.inquiryId);
  if (!inquiry) {
    res.status(404).json({ error: '문의를 찾을 수 없어요.' });
    return;
  }
  const isAdmin = req.userName === 'admin';
  const isOwner = inquiry.userId === req.userId;
  if (!isAdmin && !isOwner) {
    res.status(403).json({ error: '이 문의를 볼 권한이 없어요.' });
    return;
  }
  res.json({ inquiry, isAdmin });
});

router.post('/:inquiryId/reply', requireAuth, async (req, res) => {
  if (req.userName !== 'admin') {
    res.status(403).json({ error: '관리자만 답변할 수 있어요.' });
    return;
  }
  const reply = typeof req.body.reply === 'string' ? req.body.reply.trim() : '';
  if (!reply) {
    res.status(400).json({ error: '답변 내용을 입력해주세요.' });
    return;
  }
  const ok = await replyToInquiry(req.params.inquiryId, reply);
  if (!ok) {
    res.status(404).json({ error: '문의를 찾을 수 없어요.' });
    return;
  }
  res.json({ success: true });
});

export default router;
