import { getPool } from '@/lib/db';

export type RunningSummary = {
  totalDistanceM: number;
  totalDurationSec: number;
  averagePaceSecPerKm: number | null;
  totalCalories: number;
  runCount: number;
};

// 최근 4주(seed 데이터 범위와 맞춤) 완료된 러닝 기록을 합산한다.
// userId는 NextAuth 세션의 user.id — auth_user.users.user_id(UUID)를 그대로 쓴다.
export async function getRunningSummary(userId: string): Promise<RunningSummary | null> {
  const pool = getPool();
  const { rows } = await pool.query<{
    total_distance_m: string | null;
    total_duration_sec: string | null;
    total_calories: string | null;
    run_count: string;
  }>(
    `SELECT
       SUM(distance_m) AS total_distance_m,
       SUM(duration_sec) AS total_duration_sec,
       SUM(calories_kcal) AS total_calories,
       COUNT(*) AS run_count
     FROM running_record.runs
     WHERE user_id = $1 AND status = 'COMPLETED' AND started_at >= now() - interval '28 days'`,
    [userId]
  );

  const row = rows[0];
  const runCount = Number(row?.run_count ?? 0);
  if (runCount === 0) return null;

  const totalDistanceM = Number(row.total_distance_m ?? 0);
  const totalDurationSec = Number(row.total_duration_sec ?? 0);

  return {
    totalDistanceM,
    totalDurationSec,
    averagePaceSecPerKm: totalDistanceM > 0 ? Math.round((totalDurationSec / totalDistanceM) * 1000) : null,
    totalCalories: Number(row.total_calories ?? 0),
    runCount
  };
}

export function formatDuration(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatPace(paceSecPerKm: number) {
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}
