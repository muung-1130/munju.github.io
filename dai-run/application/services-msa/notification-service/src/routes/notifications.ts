import { Router } from 'express';
import { getUnreadNotifications, markNotificationRead } from '../lib/notifications.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

router.get('/', async (req, res) => {
  if (!req.userId) {
    res.json({ notifications: [] });
    return;
  }
  const notifications = await getUnreadNotifications(req.userId);
  res.json({ notifications });
});

router.post('/:notificationId/read', requireAuth, async (req, res) => {
  const ok = await markNotificationRead(req.params.notificationId, req.userId!);
  if (!ok) {
    res.status(404).json({ error: '알림을 찾을 수 없어요.' });
    return;
  }
  res.json({ success: true });
});

export default router;
