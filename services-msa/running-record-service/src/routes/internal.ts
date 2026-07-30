import { Router } from 'express';
import { getPool } from '../lib/db.js';

const router = Router();

// media-service의 /api/internal/media와 동일한 x-internal-secret 검증 패턴.
router.use((req, res, next) => {
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
});

// auth-service가 체중 변경(PATCH /api/auth/weight) 시 호출한다. 과거 러닝 기록의 칼로리는
// 그 시점의 체중을 몰라 재계산이 필요한데, running_record.runs는 이 서비스 소유라 auth-service가
// 직접 UPDATE하지 않고 이 내부 API를 통해서만 반영한다. 공식은 calorie.ts의 estimateCaloriesKcal와
// 동일(체중 × 거리(km) × 1.036) — 즉시 반영이 필요해 이벤트가 아니라 동기 호출로 처리한다.
router.post('/users/:userId/recalculate-calories', async (req, res) => {
  const { userId } = req.params;
  const weightKg = Number(req.body?.weightKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    res.status(400).json({ error: 'invalid weightKg' });
    return;
  }
  const pool = getPool();
  await pool.query(
    `UPDATE running_record.runs
        SET calories_kcal = ROUND((distance_m / 1000.0) * $1 * 1.036)
      WHERE user_id = $2 AND status IN ('COMPLETED', 'STOPPED') AND distance_m IS NOT NULL AND distance_m > 0`,
    [weightKg, userId]
  );
  res.json({ success: true });
});

export default router;
