import {
  NextRequest,
  NextResponse
} from 'next/server';

import { getPool } from '@/lib/db';

import {
  searchCourseIdsElasticsearch
} from '@/lib/courseSearch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest
) {
  const { searchParams } = request.nextUrl;

  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));

  const radiusM = Number(
    searchParams.get('radius_m') ?? '5000'
  );

  const showAll =
    searchParams.get('all') === 'true';

  const query =
    searchParams.get('q')?.trim() || null;

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    (
      !showAll &&
      (
        !Number.isFinite(radiusM) ||
        radiusM <= 0
      )
    )
  ) {
    return NextResponse.json(
      {
        error:
          'lat, lng, radius_m 파라미터가 올바르지 않아요.'
      },
      {
        status: 400
      }
    );
  }

  // 검증 전에는 PostgreSQL이 기본값이다.
  // 검색어가 있고 engine=elasticsearch인 경우만 ES 사용.
  const useElasticsearch =
    Boolean(query) &&
    searchParams.get('engine') ===
      'elasticsearch';

  let courseIds: string[] | null = null;

  if (query && useElasticsearch) {
    courseIds =
      await searchCourseIdsElasticsearch(query);
  }

  let extraCondition = '';
  let queryValues: unknown[] = [lat, lng];

  if (query && useElasticsearch) {
    extraCondition = `
      AND c.course_id::text =
        ANY($3::text[])
    `;

    queryValues = [
      lat,
      lng,
      courseIds ?? []
    ];
  } else if (query) {
    extraCondition = `
      AND (
        c.course_name ILIKE $3
        OR c.description ILIKE $3
        OR c.region ILIKE $3
      )
    `;

    queryValues = [
      lat,
      lng,
      `%${query}%`
    ];
  } else if (!showAll) {
    extraCondition = `
      AND ST_DWithin(
        w.location::geography,
        ST_MakePoint($2, $1)::geography,
        $3
      )
    `;

    queryValues = [
      lat,
      lng,
      radiusM
    ];
  }

  const pool = getPool();

  const { rows: nearby } = await pool.query<{
    course_id: string;
    course_name: string;
    region: string | null;
    difficulty: number | null;
    distance_m: number | null;
    distance_from_user_m: number;
    route_geojson:
      | string
      | {
          coordinates: [number, number][];
        }
      | null;
    review_average: string | null;
    review_count: number | null;
    view_count: string | null;
    like_count: string | null;
  }>(
    `
      SELECT
        c.course_id,
        c.course_name,
        c.region,
        c.difficulty,
        c.distance_m,

        ST_Distance(
          w.location::geography,
          ST_MakePoint($2, $1)::geography
        ) AS distance_from_user_m,

        ST_AsGeoJSON(
          c.route_geom
        ) AS route_geojson,

        s.review_average,
        s.review_count,
        s.view_count,
        s.like_count

      FROM course.course_waypoints w

      JOIN course.courses c
        ON c.course_id = w.course_id

      LEFT JOIN course.course_statistics s
        ON s.course_id = c.course_id

      WHERE
        w.waypoint_type = 'START'
        AND c.visibility = 'PUBLIC'
        AND c.status = 'ACTIVE'
        AND c.deleted_at IS NULL
        ${extraCondition}

      ORDER BY distance_from_user_m
    `,
    queryValues
  );

  const courses = nearby.map((row) => {
    const geojson =
      typeof row.route_geojson === 'string'
        ? JSON.parse(row.route_geojson)
        : row.route_geojson;

    return {
      courseId: row.course_id,
      name: row.course_name,
      region: row.region,
      difficulty: row.difficulty,
      distanceM: row.distance_m ?? 0,
      distanceFromUserM: Math.round(
        row.distance_from_user_m
      ),
      reviewAverage: Number(
        row.review_average ?? 0
      ),
      reviewCount: row.review_count ?? 0,
      viewCount: Number(row.view_count ?? 0),
      likeCount: Number(row.like_count ?? 0),

      positions: (
        geojson?.coordinates ?? []
      ).map(
        ([longitude, latitude]: [
          number,
          number
        ]) =>
          [
            latitude,
            longitude
          ] as [number, number]
      )
    };
  });

  return NextResponse.json({
    engine: useElasticsearch
      ? 'elasticsearch'
      : 'postgres',
    courses
  });
}
