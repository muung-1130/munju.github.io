import { Router } from 'express';
import { getPool } from '../lib/db.js';
import { requireAdmin } from '../middleware/session.js';

const router = Router();

router.get('/stats', requireAdmin, async (_req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT
         count(*) AS total_crews,
         count(*) FILTER (WHERE status = 'RECRUITING') AS recruiting_crews,
         count(*) FILTER (WHERE status = 'CLOSED') AS closed_crews,
         (SELECT count(*) FROM crew.crew_battles WHERE status = 'ACTIVE') AS active_battles
       FROM crew.crews`
    );
    const row = rows[0];
    res.json({
      totalCrews: Number(row.total_crews),
      recruitingCrews: Number(row.recruiting_crews),
      closedCrews: Number(row.closed_crews),
      activeBattles: Number(row.active_battles)
    });
  } catch (err) {
    console.error('관리자 크루 통계 조회 실패:', err);
    res.status(500).json({ error: '통계를 불러오지 못했어요.' });
  }
});

router.get('/crews', requireAdmin, async (req, res) => {
  const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50);

  try {
    const pool = getPool();
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (query) {
      params.push(`%${query}%`);
      conditions.push(`c.crew_name ILIKE $${params.length}`);
    }
    if (cursor) {
      params.push(cursor);
      conditions.push(`c.created_at < $${params.length}::timestamptz`);
    }
    params.push(limit);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT c.crew_id, c.crew_name, c.status, c.max_members, c.owner_user_id, c.created_at,
              (SELECT count(*) FROM crew.crew_members m WHERE m.crew_id = c.crew_id AND m.status = 'ACTIVE') AS member_count
         FROM crew.crews c
         ${where}
        ORDER BY c.created_at DESC
        LIMIT $${params.length}`,
      params
    );

    res.json({
      crews: rows.map((row) => ({
        crewId: row.crew_id,
        crewName: row.crew_name,
        status: row.status,
        maxMembers: row.max_members,
        memberCount: Number(row.member_count),
        ownerUserId: row.owner_user_id,
        createdAt: row.created_at
      })),
      nextCursor: rows.length === limit ? rows[rows.length - 1].created_at : null
    });
  } catch (err) {
    console.error('관리자 크루 목록 조회 실패:', err);
    res.status(500).json({ error: '크루 목록을 불러오지 못했어요.' });
  }
});

router.patch('/crews/:crewId/status', requireAdmin, async (req, res) => {
  const { crewId } = req.params;
  const status = req.body?.status;

  if (status !== 'RECRUITING' && status !== 'CLOSED') {
    res.status(400).json({ error: 'status는 RECRUITING 또는 CLOSED만 가능해요.' });
    return;
  }

  try {
    const pool = getPool();
    const { rowCount } = await pool.query('UPDATE crew.crews SET status = $1, updated_at = now() WHERE crew_id = $2', [
      status,
      crewId
    ]);
    if (rowCount === 0) {
      res.status(404).json({ error: '크루를 찾을 수 없어요.' });
      return;
    }
    res.json({ success: true, status });
  } catch (err) {
    console.error('관리자 크루 상태 변경 실패:', err);
    res.status(500).json({ error: '상태를 변경하지 못했어요.' });
  }
});

export default router;
