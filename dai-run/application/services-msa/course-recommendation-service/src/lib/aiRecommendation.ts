import { getPool } from './db.js';
import { getRandomCourses } from './course.js';
import { GUEST_DEFAULT_USER_ID, ensureGuestDefaultRecommendation, ensureTodaysRecommendation } from './aiRecommendationOrchestrator.js';
import { hasRunningPreferences } from './runningPreferences.js';
import type { AiRecoCourse } from './types.js';

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

// 찜/인기 슬롯을 없애고 rank_no 1~3 모두 순수 AI 추천으로 통일했다 — 모든 슬롯이 같은 라벨을 쓴다.
const SLOT_LABELS: Record<number, string> = {
  1: 'AI 추천',
  2: 'AI 추천',
  3: 'AI 추천'
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
  // 다시 보여주지 않는다 (course_id 기준으로 전역 판단). 단, GUEST_DEFAULT_USER_ID는 비로그인
  // 방문자 전원과 선호도 미입력 사용자 전원이 공유하는 가짜 user_id라, 이 필터를 그대로 적용하면
  // 누군가 한 번 dismiss한 코스가 다른 모든 게스트에게서도 영구히 사라진다 — 그래서 이 경우엔
  // 이 필터를 적용하지 않는다.
  const itemsQuery =
    userId === GUEST_DEFAULT_USER_ID
      ? `SELECT i.course_id, i.rank_no, i.score, i.distance_score, i.difficulty_score,
                i.environment_score, i.preference_score, i.reason
           FROM course_recommendation.recommendation_items i
          WHERE i.recommendation_id = $1
          ORDER BY i.rank_no`
      : `SELECT i.course_id, i.rank_no, i.score, i.distance_score, i.difficulty_score,
                i.environment_score, i.preference_score, i.reason
           FROM course_recommendation.recommendation_items i
          WHERE i.recommendation_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM course_recommendation.recommendation_feedback f
               WHERE f.user_id = $2 AND f.course_id = i.course_id AND f.feedback_type = 'DISMISS'
            )
          ORDER BY i.rank_no`;
  const { rows: itemRows } = await pool.query<{
    course_id: string;
    rank_no: number;
    score: string | null;
    distance_score: string | null;
    difficulty_score: string | null;
    environment_score: string | null;
    preference_score: string | null;
    reason: string | null;
  }>(itemsQuery, userId === GUEST_DEFAULT_USER_ID ? [run.recommendation_id] : [run.recommendation_id, userId]);
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
      WHERE course_id = ANY($1)
        AND visibility = 'PUBLIC' AND status = 'ACTIVE' AND deleted_at IS NULL`,
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
export async function getAiRecoPanelCourses(
  userId: string | null,
  location?: { latitude: number; longitude: number },
  forceRefresh = false,
  override?: { searchRadiusKm?: number; recommendationType?: string }
): Promise<AiRecoCourse[]> {
  // 반경/추천기준 필터나 "AI 추천 다시 받기" 버튼(forceRefresh)은 그 자체가 명시적인 개인
  // 요청이므로, 아직 선호도 설문(user_running_preferences 행)이 없는 로그인 사용자도 이
  // 순간만큼은 개인화 경로로 보낸다 — 안 그러면 게스트 공용 추천 쪽으로 빠져서 버튼을 눌러도
  // 아무 일도 일어나지 않고(게스트 추천은 전원 공유라 개인 재계산이 없다), 하루 사용 횟수도
  // 절대 줄지 않는 문제가 생긴다.
  const hasInlineFilter = Boolean(override?.searchRadiusKm || override?.recommendationType);
  if (userId && (forceRefresh || hasInlineFilter || (await hasRunningPreferences(userId)))) {
    // 오늘(KST 03:00 기준) 추천이 아직 없으면 여기서 생성을 "시작"만 시킨다 — 예전엔 이 호출을
    // await로 끝까지 기다렸는데, Bedrock 왕복이 평균 4~5초(느릴 때는 더 걸림)라 이 함수를 부르는
    // /courses, / 페이지의 SSR 전체(코스 탐색처럼 AI 추천과 무관한 영역까지)가 하루 첫 방문마다
    // 그만큼 멈춰 보이는 게 원인이었다("코스 탐색 페이지 지연" 이슈). 지금은 기다리지 않고 즉시
    // 아래 폴백(기존 추천이 있으면 그것, 없으면 무작위 코스)으로 응답하고, 생성은 백그라운드에서
    // 계속 진행해 완료되면 다음 조회(클라이언트의 위치 기반 재조회 등)에서 자연스럽게 반영된다.
    // location이 있으면(AiRecoPanel이 브라우저 GPS로 넘겨준 좌표) 그 위치를 기준으로 계산하고,
    // 이미 오늘 계산된 추천이 있으면 하루 1회 제한에 따라 location과 무관하게 그대로 재사용한다.
    //
    // forceRefresh("AI 추천 다시 받기" 버튼)일 때는 예외적으로 끝까지 기다린다 — 사용자가 명시적
    // 버튼을 눌러 방금 새로 받은 결과를 보고 싶어하는 경우라, 백그라운드로 흘려보내면 화면이
    // 그대로인 채 아무 일도 안 일어난 것처럼 보인다.
    if (forceRefresh) {
      await ensureTodaysRecommendation(userId, location, true, override);
    } else {
      ensureTodaysRecommendation(userId, location, false, override).catch(() => {});
    }

    const recommended = await getActiveRecommendationsForUser(userId);
    if (recommended.length > 0) {
      return recommended.map((course) => ({ ...course, isDefaultRecommendation: false }));
    }
    const randomCourses = await getRandomCourses(3);
    return randomCourses.map((course) => ({ ...course, recommendationId: null, isDefaultRecommendation: false }));
  }

  // 선호도가 없는 로그인 사용자와 비로그인 방문자는 매일 한 번만 계산되는 공용 기본 추천을
  // 공유한다 — 사람마다 똑같은(선호 없음) 입력으로 Bedrock을 반복 호출하지 않기 위함.
  // 위와 같은 이유로 완료를 기다리지 않고 백그라운드로만 트리거한다.
  ensureGuestDefaultRecommendation().catch(() => {});
  const guestRecommended = await getActiveRecommendationsForUser(GUEST_DEFAULT_USER_ID);
  if (guestRecommended.length > 0) {
    return guestRecommended.map((course) => ({ ...course, isDefaultRecommendation: true }));
  }
  const randomCourses = await getRandomCourses(3);
  return randomCourses.map((course) => ({ ...course, recommendationId: null, isDefaultRecommendation: true }));
}
