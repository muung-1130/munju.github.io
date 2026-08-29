import { getPool } from './db.js';

// course.courses는 Course 서비스 소유 스키마다. 무작위 폴백 코스 조회만 여기서도 필요해서
// 복제해왔다(운영 개선 단계에서 Course 서비스 API 호출로 바꾸는 게 정석).
export type RandomCourse = {
  courseId: string;
  name: string;
  distanceM: number;
  positions: [number, number][];
};

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
