import { getPool } from '@/lib/db';

export { DIFFICULTY_LABEL, DIFFICULTY_COLOR } from '@/lib/courseDifficulty';

export type RandomCourse = { courseId: string; name: string; distanceM: number };

// 오늘의 AI 추천 코스 캐러셀용으로 course.courses에서 무작위 N건을 뽑는다.
export async function getRandomCourses(limit: number): Promise<RandomCourse[]> {
  const pool = getPool();
  const { rows } = await pool.query<{ course_id: string; course_name: string; distance_m: number | null }>(
    `SELECT course_id, course_name, distance_m
       FROM course.courses
      WHERE visibility = 'PUBLIC' AND status = 'ACTIVE' AND deleted_at IS NULL
      ORDER BY random()
      LIMIT $1`,
    [limit]
  );
  return rows.map((row) => ({ courseId: row.course_id, name: row.course_name, distanceM: row.distance_m ?? 0 }));
}
