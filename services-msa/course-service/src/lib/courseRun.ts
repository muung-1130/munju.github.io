import { getPool } from './db.js';

export type CourseRouteInfo = {
  courseId: string;
  courseName: string;
  distanceM: number;
  positions: [number, number][];
};

// Running Record 서비스의 "출발" 화면이 러닝 기록을 만들기 전에 코스 경로만 미리 읽어오는 용도.
// course.courses는 Course 서비스가 소유하므로 여기 있는 게 맞고, Running Record는 이 서비스의
// /api/courses/:courseId/track-info를 호출해서 얻는다(직접 DB 조회하지 않음).
export async function getCourseRouteForRun(courseId: string): Promise<CourseRouteInfo | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT course_id, course_name, distance_m, ST_AsGeoJSON(route_geom) AS route_geojson
       FROM course.courses WHERE course_id = $1 AND deleted_at IS NULL`,
    [courseId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const geojson = row.route_geojson ? JSON.parse(row.route_geojson) : null;
  return {
    courseId: row.course_id,
    courseName: row.course_name,
    distanceM: row.distance_m ?? 0,
    positions: (geojson?.coordinates ?? []).map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
  };
}
