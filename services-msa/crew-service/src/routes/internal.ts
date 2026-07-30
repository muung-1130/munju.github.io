import { Router } from 'express';
import { getPool } from '../lib/db.js';
import { leaveCrew } from '../lib/crew.js';

const router = Router();

// 다른 서비스가 세션 없이 호출하는 서비스 간 전용 경로다 — media-service의
// /api/internal/media와 동일한 x-internal-secret 검증 패턴을 쓴다.
router.use((req, res, next) => {
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
});

// 회원 탈퇴 시 auth-service가 호출한다. 본인이 ACTIVE로 속한 모든 크루에서 나가게 한다 —
// 마지막 멤버면 크루 자체가 삭제되는 것까지 leaveCrew가 그대로 처리한다(공개 라우트
// POST /:crewId/leave와 동일 로직, 세션이 없는 서비스 간 호출이라 requireAuth 대신 이 경로를 쓴다).
router.post('/users/:userId/withdraw', async (req, res) => {
  const { userId } = req.params;
  const pool = getPool();
  const { rows } = await pool.query(`SELECT crew_id FROM crew.crew_members WHERE user_id = $1 AND status = 'ACTIVE'`, [userId]);
  for (const row of rows) {
    await leaveCrew(row.crew_id, userId);
  }
  res.json({ success: true });
});

export default router;
