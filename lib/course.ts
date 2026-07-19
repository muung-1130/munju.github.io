import { getPool } from '@/lib/db';

export { DIFFICULTY_LABEL, DIFFICULTY_COLOR } from '@/lib/courseDifficulty';

export type RandomCourse = {
  courseId: string;
  name: string;
  distanceM: number;
  positions: [number, number][];
};

// 오늘의 AI 추천 코스 캐러셀용으로 course.courses에서 무작위 N건을 뽑는다. route_geom도 함께
// 가져와 추천 카드에 코스를 시각화한 작은 지도를 같이 보여줄 수 있게 한다.
export async function getRandomCourses(limit: number): Promise<RandomCourse[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    course_id: string;
    course_name: string;
    distance_m: number | null;
    route_geojson: { coordinates: [number, number][] } | null;
  }>(
    `SELECT course_id, course_name, distance_m, ST_AsGeoJSON(route_geom) AS route_geojson
       FROM course.courses
      WHERE visibility = 'PUBLIC' AND status = 'ACTIVE' AND deleted_at IS NULL
      ORDER BY random()
      LIMIT $1`,
    [limit]
  );
  return rows.map((row) => {
    const geojson = typeof row.route_geojson === 'string' ? JSON.parse(row.route_geojson) : row.route_geojson;
    return {
      courseId: row.course_id,
      name: row.course_name,
      distanceM: row.distance_m ?? 0,
      positions: (geojson?.coordinates ?? []).map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
    };
  });
}
