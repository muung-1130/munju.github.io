import { Router } from 'express';
import { getPool } from '../lib/db.js';
import { searchCourseIdsElasticsearch } from '../lib/courseSearch.js';
import {
  createCourseReview,
  deleteCourseReview,
  getCourseLikeState,
  getCourseReviews,
  toggleCourseLike,
  updateCourseReview
} from '../lib/courseSocial.js';
import { getCourseRouteForRun } from '../lib/courseRun.js';
import { createCourseFromRun } from '../lib/courseFromRun.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

// Running Record 서비스 소유 데이터(러닝 경로)를 여기서 직접 조회하지 않고, 그 서비스의
// 본인 인증된 조회 API를 호출한다 — course-service가 running_record 스키마를 직접 들여다보지
// 않도록 하는 경계(runs.ts가 course-service의 track-info를 호출하는 것과 대칭되는 패턴).
const RUNNING_RECORD_SERVICE_URL = process.env.RUNNING_RECORD_SERVICE_URL ?? 'http://running-record-service:4000';
const COURSE_NAME_MAX_LENGTH = 300;

const DISTANCE_BUCKET_RANGES: Record<string, [number, number | null]> = {
  KM5: [0, 5000],
  KM10: [5000, 10000],
  KM15: [10000, 19000],
  HALF: [19000, 30000],
  FULL: [30000, null]
};

router.get('/nearby', async (req, res) => {
  const q = req.query;
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  const radiusM = Number(q.radius_m ?? '5000');
  const showAll = q.all === 'true';
  const query = typeof q.q === 'string' ? q.q.trim() || null : null;
  const distanceBucket = typeof q.distance_bucket === 'string' ? q.distance_bucket.trim() || null : null;
  const courseType = typeof q.course_type === 'string' ? q.course_type.trim() || null : null;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!showAll && (!Number.isFinite(radiusM) || radiusM <= 0))) {
    res.status(400).json({ error: 'lat, lng, radius_m 파라미터가 올바르지 않아요.' });
    return;
  }

  const useElasticsearch = Boolean(query) && q.engine === 'elasticsearch';
  let courseIds: string[] | null = null;
  if (query && useElasticsearch) {
    courseIds = await searchCourseIdsElasticsearch(query);
  }

  const conditions: string[] = [`w.waypoint_type = 'START'`, `c.visibility = 'PUBLIC'`, `c.status = 'ACTIVE'`, `c.deleted_at IS NULL`];
  const values: unknown[] = [lat, lng];

  if (query && useElasticsearch) {
    values.push(courseIds ?? []);
    conditions.push(`c.course_id::text = ANY($${values.length}::text[])`);
  } else if (query) {
    values.push(`%${query}%`);
    conditions.push(`(c.course_name ILIKE $${values.length} OR c.description ILIKE $${values.length} OR c.region ILIKE $${values.length})`);
  } else if (!showAll) {
    values.push(radiusM);
    conditions.push(`ST_DWithin(w.location::geography, ST_MakePoint($2, $1)::geography, $${values.length})`);
  }

  if (distanceBucket && DISTANCE_BUCKET_RANGES[distanceBucket]) {
    const [min, max] = DISTANCE_BUCKET_RANGES[distanceBucket];
    values.push(min);
    const minParam = values.length;
    if (max === null) {
      conditions.push(`c.distance_m > $${minParam}`);
    } else {
      values.push(max);
      conditions.push(`c.distance_m > $${minParam} AND c.distance_m <= $${values.length}`);
    }
  }

  if (courseType) {
    values.push(courseType);
    conditions.push(`c.course_type = $${values.length}`);
  }

  const pool = getPool();
  const { rows: nearby } = await pool.query<{
    course_id: string;
    course_name: string;
    region: string | null;
    difficulty: number | null;
    distance_m: number | null;
    distance_from_user_m: number;
    route_geojson: string | { coordinates: [number, number][] } | null;
    review_average: string | null;
    review_count: number | null;
    view_count: string | null;
    like_count: string | null;
  }>(
    `SELECT c.course_id, c.course_name, c.region, c.difficulty, c.distance_m,
            ST_Distance(w.location::geography, ST_MakePoint($2, $1)::geography) AS distance_from_user_m,
            ST_AsGeoJSON(c.route_geom) AS route_geojson,
            s.review_average, s.review_count, s.view_count, s.like_count
       FROM course.course_waypoints w
       JOIN course.courses c ON c.course_id = w.course_id
       LEFT JOIN course.course_statistics s ON s.course_id = c.course_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY distance_from_user_m`,
    values
  );

  const courses = nearby.map((row) => {
    const geojson = typeof row.route_geojson === 'string' ? JSON.parse(row.route_geojson) : row.route_geojson;
    return {
      courseId: row.course_id,
      name: row.course_name,
      region: row.region,
      difficulty: row.difficulty,
      distanceM: row.distance_m ?? 0,
      distanceFromUserM: Math.round(row.distance_from_user_m),
      reviewAverage: Number(row.review_average ?? 0),
      reviewCount: row.review_count ?? 0,
      viewCount: Number(row.view_count ?? 0),
      likeCount: Number(row.like_count ?? 0),
      positions: (geojson?.coordinates ?? []).map(([longitude, latitude]: [number, number]) => [latitude, longitude] as [number, number])
    };
  });

  res.json({ engine: useElasticsearch ? 'elasticsearch' : 'postgres', courses });
});

function isValidRating(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 5 && Math.round(value * 2) === value * 2;
}

router.get('/:courseId/reviews', async (req, res) => {
  const reviews = await getCourseReviews(req.params.courseId);
  res.json({ reviews });
});

router.post('/:courseId/reviews', requireAuth, async (req, res) => {
  const { overallRating, surfaceRating, sceneryRating, slopeRating, content } = req.body ?? {};
  if (![overallRating, surfaceRating, sceneryRating, slopeRating].every(isValidRating)) {
    res.status(400).json({ error: '별점은 0~5 사이 0.5 단위로 입력해주세요.' });
    return;
  }
  if (overallRating === 0) {
    res.status(400).json({ error: '전체 평점을 선택해주세요.' });
    return;
  }
  await createCourseReview({
    courseId: req.params.courseId,
    userId: req.userId!,
    overallRating,
    surfaceRating,
    sceneryRating,
    slopeRating,
    content: typeof content === 'string' ? content.trim().slice(0, 2000) : ''
  });
  res.json({ success: true });
});

router.patch('/reviews/:reviewId', requireAuth, async (req, res) => {
  const { overallRating, surfaceRating, sceneryRating, slopeRating, content } = req.body ?? {};
  if (![overallRating, surfaceRating, sceneryRating, slopeRating].every(isValidRating)) {
    res.status(400).json({ error: '별점은 0~5 사이 0.5 단위로 입력해주세요.' });
    return;
  }
  if (overallRating === 0) {
    res.status(400).json({ error: '전체 평점을 선택해주세요.' });
    return;
  }
  const updated = await updateCourseReview({
    reviewId: req.params.reviewId,
    userId: req.userId!,
    overallRating,
    surfaceRating,
    sceneryRating,
    slopeRating,
    content: typeof content === 'string' ? content.trim().slice(0, 2000) : ''
  });
  if (!updated) {
    res.status(404).json({ error: '리뷰를 찾을 수 없거나 수정 권한이 없어요.' });
    return;
  }
  res.json({ success: true });
});

router.delete('/reviews/:reviewId', requireAuth, async (req, res) => {
  const deleted = await deleteCourseReview(req.params.reviewId, req.userId!);
  if (!deleted) {
    res.status(404).json({ error: '리뷰를 찾을 수 없거나 삭제 권한이 없어요.' });
    return;
  }
  res.json({ success: true });
});

router.get('/:courseId/like', async (req, res) => {
  const state = await getCourseLikeState(req.params.courseId, req.userId ?? null);
  res.json(state);
});

router.post('/:courseId/like', requireAuth, async (req, res) => {
  const state = await toggleCourseLike(req.params.courseId, req.userId!);
  res.json(state);
});

router.get('/:courseId/track-info', async (req, res) => {
  const course = await getCourseRouteForRun(req.params.courseId);
  if (!course) {
    res.status(404).json({ error: '코스를 찾을 수 없어요.' });
    return;
  }
  res.json({ course });
});

// 내 자율 달리기 기록을 코스 탐색에 노출되는 코스로 등록한다. 작성자는 요청한 로그인 사용자
// 본인이며(owner_user_id), 이후 코스 상세에서는 다른 코스와 동일하게 찜/리뷰 대상이 된다.
router.post('/from-run', requireAuth, async (req, res) => {
  const runId = typeof req.body?.runId === 'string' ? req.body.runId : null;
  const courseName = typeof req.body?.courseName === 'string' ? req.body.courseName.trim() : '';
  if (!runId) {
    res.status(400).json({ error: '러닝 기록을 확인해주세요.' });
    return;
  }
  if (!courseName || courseName.length > COURSE_NAME_MAX_LENGTH) {
    res.status(400).json({ error: `코스 이름을 1~${COURSE_NAME_MAX_LENGTH}자로 입력해주세요.` });
    return;
  }

  let route: { distanceM: number; positions: [number, number][] } | null = null;
  try {
    const runRes = await fetch(`${RUNNING_RECORD_SERVICE_URL}/api/runs/${runId}/route-info`, {
      headers: req.headers.cookie ? { Cookie: req.headers.cookie } : undefined
    });
    if (runRes.ok) route = await runRes.json();
  } catch (err) {
    console.error('running-record-service 조회 실패:', err);
  }

  if (!route || route.positions.length < 2) {
    res.status(404).json({ error: '코스로 추천할 수 있는 러닝 기록이 아니에요.' });
    return;
  }

  const courseId = await createCourseFromRun({
    ownerUserId: req.userId!,
    courseName,
    distanceM: route.distanceM,
    positions: route.positions
  });
  res.json({ courseId });
});

export default router;
