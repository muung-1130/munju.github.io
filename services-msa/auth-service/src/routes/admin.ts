import { Router } from 'express';
import { getPool } from '../lib/db.js';
import { requireAdmin } from '../middleware/session.js';

const router = Router();

router.get('/stats', requireAdmin, async (_req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT
         count(*) FILTER (WHERE deleted_at IS NULL) AS total_users,
         count(*) FILTER (WHERE deleted_at IS NULL AND status = 'ACTIVE') AS active_users,
         count(*) FILTER (WHERE deleted_at IS NULL AND status = 'SUSPENDED') AS suspended_users,
         count(*) FILTER (WHERE deleted_at IS NULL AND last_login_at >= now() - INTERVAL '7 days') AS recent_active_users
       FROM auth_user.users`
    );
    const row = rows[0];
    res.json({
      totalUsers: Number(row.total_users),
      activeUsers: Number(row.active_users),
      suspendedUsers: Number(row.suspended_users),
      recentActiveUsers: Number(row.recent_active_users)
    });
  } catch (err) {
    console.error('관리자 통계 조회 실패:', err);
    res.status(500).json({ error: '통계를 불러오지 못했어요.' });
  }
});

router.get('/users', requireAdmin, async (req, res) => {
  const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50);

  try {
    const pool = getPool();
    const params: unknown[] = [];
    const conditions: string[] = ['deleted_at IS NULL'];

    if (query) {
      params.push(`%${query}%`);
      conditions.push(`(nickname ILIKE $${params.length} OR user_name ILIKE $${params.length} OR user_email ILIKE $${params.length})`);
    }
    if (cursor) {
      params.push(cursor);
      conditions.push(`created_at < $${params.length}::timestamptz`);
    }
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT user_id, user_name, nickname, user_email, status, created_at, last_login_at, is_admin
         FROM auth_user.users
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${params.length}`,
      params
    );

    res.json({
      users: rows.map((row) => ({
        userId: row.user_id,
        userName: row.user_name,
        nickname: row.nickname,
        email: row.user_email,
        status: row.status,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
        isAdmin: row.is_admin
      })),
      nextCursor: rows.length === limit ? rows[rows.length - 1].created_at : null
    });
  } catch (err) {
    console.error('관리자 사용자 목록 조회 실패:', err);
    res.status(500).json({ error: '사용자 목록을 불러오지 못했어요.' });
  }
});

router.patch('/users/:userId/status', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const status = req.body?.status;

  if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
    res.status(400).json({ error: 'status는 ACTIVE 또는 SUSPENDED만 가능해요.' });
    return;
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT is_admin FROM auth_user.users WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: '사용자를 찾을 수 없어요.' });
      return;
    }
    if (rows[0].is_admin) {
      res.status(400).json({ error: '관리자 계정은 정지할 수 없어요.' });
      return;
    }

    await pool.query('UPDATE auth_user.users SET status = $1, updated_at = now() WHERE user_id = $2', [status, userId]);
    res.json({ success: true, status });
  } catch (err) {
    console.error('관리자 사용자 상태 변경 실패:', err);
    res.status(500).json({ error: '상태를 변경하지 못했어요.' });
  }
});

export default router;
