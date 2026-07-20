import { getPool } from '@/lib/db';
import { getRandomCourses } from '@/lib/course';
import { ensureTodaysRecommendation } from '@/lib/aiRecommendationOrchestrator';
import type { AiRecoCourse } from '@/components/AiRecoPanel';

export type AiRecommendedCourse = {
  recommendationId: string;
  courseId: string;
  name: string;
  distanceM: number;
  positions: [number, number][];
  rankNo: number;
  slotLabel: string;
  score: number | null;
  distanceScore: number | null;
  difficultyScore: number | null;
  environmentScore: number | null;
  preferenceScore: number | null;
  reason: string | null;
  createdAt: string;
  modelVersion: string | null;
  likedByUser: boolean;
  likeCount: number;
};

// rank_no는 2안 결정에 따라 고정된 슬롯 의미를 가진다 (숫자 순위가 아니라 슬롯 종류) —
// 새 슬롯이 추가되면 여기 라벨만 늘리면 된다.
const SLOT_LABELS: Record<number, string> = {
  1: 'AI 추천',
  2: '찜했던 코스',
  3: '인기 코스'
};

export const FEEDBACK_TYPES = ['CLICK', 'LIKE', 'START_RUN', 'DISMISS'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

// course_recommendation은 별도 서비스 스키마라 course.courses와 물리 JOIN을 새로 만드는 대신,
// (1) 이 사용자의 최근 추천 실행에서 course_id 목록만 뽑고 (2) 그 course_id들의 표시용 정보를
// course.courses에서 따로 조회해 애플리케이션 레벨에서 합친다.
export async function getActiveRecommendationsForUser(userId: string): Promise<AiRecommendedCourse[]> {
  const pool = getPool();

  const { rows: runRows } = await pool.query<{
    recommendation_id: string;
    model_version: string | null;
    created_at: string;
  }>(
    `SELECT recommendation_id, model_version, created_at
       FROM course_recommendation.recommendation_runs
      WHERE user_id = $1 AND status = 'COMPLETED'
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );
  const run = runRows[0];
  if (!run) return [];

  // 이 사용자가 예전에 "마음에 안들어요"를 누른 코스는, 그게 이번 추천 실행이 아니었더라도
  // 다시 보여주지 않는다 (course_id 기준으로 전역 판단).
  const { rows: itemRows } = await pool.query<{
    course_id: string;
    rank_no: number;
    score: string | null;
    distance_score: string | null;
    difficulty_score: string | null;
    environment_score: string | null;
    preference_score: string | null;
    reason: string | null;
  }>(
    `SELECT i.course_id, i.rank_no, i.score, i.distance_score, i.difficulty_score,
            i.environment_score, i.preference_score, i.reason
       FROM course_recommendation.recommendation_items i
      WHERE i.recommendation_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM course_recommendation.recommendation_feedback f
           WHERE f.user_id = $2 AND f.course_id = i.course_id AND f.feedback_type = 'DISMISS'
        )
      ORDER BY i.rank_no`,
    [run.recommendation_id, userId]
  );
  if (itemRows.length === 0) return [];

  const courseIds = itemRows.map((row) => row.course_id);
  const { rows: courseRows } = await pool.query<{
    course_id: string;
    course_name: string;
    distance_m: number | null;
    route_geojson: { coordinates: [number, number][] } | null;
  }>(
    `SELECT course_id, course_name, distance_m, ST_AsGeoJSON(route_geom) AS route_geojson
       FROM course.courses
      WHERE course_id = ANY($1)`,
    [courseIds]
  );
  const courseById = new Map(courseRows.map((row) => [row.course_id, row]));

  const { rows: likeRows } = await pool.query<{ course_id: string; like_count: string }>(
    `SELECT course_id, COUNT(*) AS like_count
       FROM course.course_likes
      WHERE course_id = ANY($1)
      GROUP BY course_id`,
    [courseIds]
  );
  const likeCountByCourse = new Map(likeRows.map((row) => [row.course_id, Number(row.like_count)]));

  const { rows: likedByUserRows } = await pool.query<{ course_id: string }>(
    `SELECT course_id FROM course.course_likes WHERE course_id = ANY($1) AND user_id = $2`,
    [courseIds, userId]
  );
  const likedCourseIds = new Set(likedByUserRows.map((row) => row.course_id));

  // 이 사용자가 과거에 슬롯(rank_no)별로 CLICK을 얼마나 많이 했는지 집계해서, 가장 많이
  // 클릭했던 슬롯 종류를 카드 배열 맨 앞으로 보낸다 (콘텐츠 자체는 안 바꾸고 노출 순서만 조정).
  const { rows: clickStatRows } = await pool.query<{ rank_no: number; click_count: string }>(
    `SELECT i.rank_no, COUNT(*) AS click_count
       FROM course_recommendation.recommendation_feedback f
       JOIN course_recommendation.recommendation_items i
         ON i.recommendation_id = f.recommendation_id AND i.course_id = f.course_id
      WHERE f.user_id = $1 AND f.feedback_type = 'CLICK'
      GROUP BY i.rank_no`,
    [userId]
  );
  const clickCountByRank = new Map(clickStatRows.map((row) => [row.rank_no, Number(row.click_count)]));

  const items = itemRows
    .map((item): AiRecommendedCourse | null => {
      const course = courseById.get(item.course_id);
      if (!course) return null; // 코스가 삭제/비공개 전환된 경우 등 — 화면에 노출하지 않는다.
      const geojson =
        typeof course.route_geojson === 'string' ? JSON.parse(course.route_geojson) : course.route_geojson;
      return {
        recommendationId: run.recommendation_id,
        courseId: item.course_id,
        name: course.course_name,
        distanceM: course.distance_m ?? 0,
        positions: (geojson?.coordinates ?? []).map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]),
        rankNo: item.rank_no,
        slotLabel: SLOT_LABELS[item.rank_no] ?? 'AI 추천',
        score: item.score !== null ? Number(item.score) : null,
        distanceScore: item.distance_score !== null ? Number(item.distance_score) : null,
        difficultyScore: item.difficulty_score !== null ? Number(item.difficulty_score) : null,
        environmentScore: item.environment_score !== null ? Number(item.environment_score) : null,
        preferenceScore: item.preference_score !== null ? Number(item.preference_score) : null,
        reason: item.reason,
        createdAt: run.created_at,
        modelVersion: run.model_version,
        likedByUser: likedCourseIds.has(item.course_id),
        likeCount: likeCountByCourse.get(item.course_id) ?? 0
      };
    })
    .filter((item): item is AiRecommendedCourse => item !== null);

  if (clickCountByRank.size > 0) {
    items.sort((a, b) => (clickCountByRank.get(b.rankNo) ?? 0) - (clickCountByRank.get(a.rankNo) ?? 0));
  }
  return items;
}

export async function recordRecommendationFeedback(
  userId: string,
  recommendationId: string,
  courseId: string,
  feedbackType: FeedbackType
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO course_recommendation.recommendation_feedback (recommendation_id, course_id, user_id, feedback_type)
     VALUES ($1, $2, $3, $4)`,
    [recommendationId, courseId, userId, feedbackType]
  );
}

// 홈/코스탐색 페이지의 "오늘의 AI 추천 코스" 패널용. 로그인 상태고 실제 추천이 있으면 그걸 쓰고,
// 아니면 (로그인 전이거나 아직 추천을 받은 적 없으면) 기존처럼 무작위 코스로 대체한다 —
// 패널 자체가 비어 보이는 것보다 이 편이 낫다는 판단.
export async function getAiRecoPanelCourses(userId: string | null): Promise<AiRecoCourse[]> {
  if (userId) {
    // 오늘(KST 03:00 기준) 추천이 아직 없으면 여기서 만든다 — 로그인 후 첫 조회가 트리거.
    // AI 서비스가 안 떠 있거나 실패해도 조용히 넘어가고 아래에서 기존 추천/폴백으로 처리된다.
    await ensureTodaysRecommendation(userId).catch(() => {});

    const recommended = await getActiveRecommendationsForUser(userId);
    if (recommended.length > 0) {
      return recommended.map((course) => ({ ...course }));
    }
  }
  const randomCourses = await getRandomCourses(3);
  return randomCourses.map((course) => ({ ...course, recommendationId: null }));
}
