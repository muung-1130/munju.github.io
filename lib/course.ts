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

export type DistanceBucketLabel = '5km' | '10km' | '15km' | '하프' | '풀';

export type CourseDistanceBucketCount = { label: DistanceBucketLabel; count: number };

// 마라톤 페이지와 같은 거리 구간 기준(5/10/15/하프/풀)으로 코스 개수를 센다.
export async function getCourseDistanceBucketCounts(): Promise<CourseDistanceBucketCount[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    km5: string; km10: string; km15: string; half: string; full: string;
  }>(
    `SELECT
        COUNT(*) FILTER (WHERE distance_m <= 5000) AS km5,
        COUNT(*) FILTER (WHERE distance_m > 5000 AND distance_m <= 10000) AS km10,
        COUNT(*) FILTER (WHERE distance_m > 10000 AND distance_m < 20000) AS km15,
        COUNT(*) FILTER (WHERE distance_m >= 20000 AND distance_m <= 30000) AS half,
        COUNT(*) FILTER (WHERE distance_m > 30000) AS full
       FROM course.courses
      WHERE visibility = 'PUBLIC' AND status = 'ACTIVE' AND deleted_at IS NULL`
  );
  const row = rows[0];
  return [
    { label: '5km', count: Number(row.km5) },
    { label: '10km', count: Number(row.km10) },
    { label: '15km', count: Number(row.km15) },
    { label: '하프', count: Number(row.half) },
    { label: '풀', count: Number(row.full) }
  ];
}

export type CourseOverallStats = { courseCount: number; totalViewCount: number; totalLikeCount: number };

// course.course_statistics 전체 합산 — 코스탐색 페이지의 "코스 통계" 카드용.
export async function getCourseOverallStats(): Promise<CourseOverallStats> {
  const pool = getPool();
  const { rows } = await pool.query<{ course_count: string; total_views: string | null; total_likes: string | null }>(
    `SELECT
        (SELECT COUNT(*) FROM course.courses WHERE visibility = 'PUBLIC' AND status = 'ACTIVE' AND deleted_at IS NULL) AS course_count,
        (SELECT COALESCE(SUM(view_count), 0) FROM course.course_statistics) AS total_views,
        (SELECT COALESCE(SUM(like_count), 0) FROM course.course_statistics) AS total_likes`
  );
  const row = rows[0];
  return {
    courseCount: Number(row.course_count),
    totalViewCount: Number(row.total_views ?? 0),
    totalLikeCount: Number(row.total_likes ?? 0)
  };
}
