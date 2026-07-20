import { getPool } from '@/lib/db';
import { computeScores } from '@/lib/recommendationScoring';

const AI_SERVICE_URL = process.env.AI_RECOMMENDATION_SERVICE_URL ?? 'http://192.168.0.201:8001';
const DAILY_CUTOFF_HOUR = 3; // FastAPI 쪽 repository.py의 _todays_recommendation_cutoff와 동일 기준 (KST 03:00)

const DIFFICULTY_TO_INT: Record<string, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };

type Candidate = {
  candidateId: string;
  name: string;
  distanceM: number | null;
  difficulty: number | null;
  region: string | null;
  description: string | null;
  viewCount: number;
  likeCount: number;
  reviewCount: number;
  reviewAverage: number;
};

function todaysCutoffUtc(): Date {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC -> KST 표시용 (Date 객체 자체는 여전히 UTC 타임스탬프)
  const cutoffKst = new Date(
    Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate(), DAILY_CUTOFF_HOUR, 0, 0)
  );
  if (nowKst < cutoffKst) cutoffKst.setUTCDate(cutoffKst.getUTCDate() - 1);
  return new Date(cutoffKst.getTime() - 9 * 60 * 60 * 1000); // KST -> UTC
}

async function hasTodaysRecommendation(userId: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM course_recommendation.recommendation_runs
      WHERE user_id = $1 AND status = 'COMPLETED' AND created_at >= $2
      LIMIT 1`,
    [userId, todaysCutoffUtc().toISOString()]
  );
  return rows.length > 0;
}

async function getDismissedCourseIds(userId: string): Promise<Set<string>> {
  const pool = getPool();
  const { rows } = await pool.query<{ course_id: string }>(
    `SELECT DISTINCT course_id FROM course_recommendation.recommendation_feedback
      WHERE user_id = $1 AND feedback_type = 'DISMISS'`,
    [userId]
  );
  return new Set(rows.map((row) => row.course_id));
}

// user_running_preferences + recommendation_feedback로 실제 요청을 구성한다 (예전엔 request.json
// 고정값을 그대로 썼음 — "popular_based"가 항상 뜨던 원인이 이거였다).
async function buildPreference(userId: string): Promise<{
  preferredDistanceKm: number | null;
  difficulty: number | null;
  preferredEnvironment: string | null;
  recommendationType: string;
}> {
  const pool = getPool();

  const { rows: prefRows } = await pool.query<{
    preferred_distance_m: number | null;
    difficulty: string | null;
    preferred_scenery: string | null;
  }>(
    `SELECT preferred_distance_m, difficulty, preferred_scenery
       FROM auth_user.user_running_preferences WHERE user_id = $1`,
    [userId]
  );
  const profile = prefRows[0];
  const preferredDistanceKm = profile?.preferred_distance_m ? profile.preferred_distance_m / 1000 : null;
  const difficulty = profile?.difficulty ? DIFFICULTY_TO_INT[profile.difficulty] ?? null : null;
  const preferredEnvironment = profile?.preferred_scenery ?? null;

  // recommendation_type 추론: 이 사용자가 LIKE/START_RUN을 남긴 코스들의 점수 breakdown 중
  // 어떤 항목이 평균적으로 가장 높았는지로 "이 사람은 뭘 중요하게 보는지" 판단한다.
  // 데이터가 부족하면(3건 미만) 개인화할 근거가 없으므로 "선호 거리 매칭"을 기본값으로 쓴다.
  const { rows: feedbackScoreRows } = await pool.query<{
    distance_score: string | null;
    difficulty_score: string | null;
    preference_score: string | null;
  }>(
    `SELECT i.distance_score, i.difficulty_score, i.preference_score
       FROM course_recommendation.recommendation_feedback f
       JOIN course_recommendation.recommendation_items i
         ON i.recommendation_id = f.recommendation_id AND i.course_id = f.course_id
      WHERE f.user_id = $1 AND f.feedback_type IN ('LIKE', 'START_RUN')`,
    [userId]
  );

  let recommendationType = 'distance_based';
  if (feedbackScoreRows.length >= 3) {
    const avg = (values: (string | null)[]) => {
      const nums = values.filter((v): v is string => v !== null).map(Number);
      return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : -1;
    };
    const avgDistance = avg(feedbackScoreRows.map((r) => r.distance_score));
    const avgDifficulty = avg(feedbackScoreRows.map((r) => r.difficulty_score));
    const avgPreference = avg(feedbackScoreRows.map((r) => r.preference_score));
    const best = Math.max(avgDistance, avgDifficulty, avgPreference);
    if (best === avgPreference && avgPreference >= 0) recommendationType = 'popular_based';
    else if (best === avgDifficulty && avgDifficulty >= 0) recommendationType = 'difficulty_based';
    else if (best === avgDistance && avgDistance >= 0) recommendationType = 'distance_based';
  }

  return { preferredDistanceKm, difficulty, preferredEnvironment, recommendationType };
}

async function getCandidatePool(excludeCourseIds: Set<string>): Promise<Candidate[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    course_id: string;
    course_name: string;
    distance_m: number | null;
    difficulty: number | null;
    region: string | null;
    description: string | null;
    view_count: string | null;
    like_count: string | null;
    review_count: number | null;
    review_average: string | null;
  }>(
    `SELECT c.course_id, c.course_name, c.distance_m, c.difficulty, c.region, c.description,
            COALESCE(s.view_count, 0) AS view_count,
            COALESCE(s.like_count, 0) AS like_count,
            COALESCE(s.review_count, 0) AS review_count,
            COALESCE(s.review_average, 0) AS review_average
       FROM course.courses c
       LEFT JOIN course.course_statistics s ON s.course_id = c.course_id
      WHERE c.visibility = 'PUBLIC' AND c.status = 'ACTIVE' AND c.deleted_at IS NULL`
  );

  return rows
    .filter((row) => !excludeCourseIds.has(row.course_id))
    .map((row) => ({
      candidateId: row.course_id,
      name: row.course_name,
      distanceM: row.distance_m,
      difficulty: row.difficulty,
      region: row.region,
      description: row.description,
      viewCount: Number(row.view_count ?? 0),
      likeCount: Number(row.like_count ?? 0),
      reviewCount: Number(row.review_count ?? 0),
      reviewAverage: Number(row.review_average ?? 0)
    }));
}

async function pickLikedSlot(userId: string, excludeCourseIds: Set<string>): Promise<Candidate | null> {
  const pool = getPool();
  const { rows } = await pool.query<{
    course_id: string;
    course_name: string;
    distance_m: number | null;
    difficulty: number | null;
    region: string | null;
    description: string | null;
    view_count: string | null;
    like_count: string | null;
    review_count: number | null;
    review_average: string | null;
  }>(
    `SELECT c.course_id, c.course_name, c.distance_m, c.difficulty, c.region, c.description,
            COALESCE(s.view_count, 0) AS view_count,
            COALESCE(s.like_count, 0) AS like_count,
            COALESCE(s.review_count, 0) AS review_count,
            COALESCE(s.review_average, 0) AS review_average
       FROM course.course_likes l
       JOIN course.courses c ON c.course_id = l.course_id
       LEFT JOIN course.course_statistics s ON s.course_id = c.course_id
      WHERE l.user_id = $1 AND c.visibility = 'PUBLIC' AND c.status = 'ACTIVE' AND c.deleted_at IS NULL
      ORDER BY l.created_at DESC`,
    [userId]
  );
  const row = rows.find((r) => !excludeCourseIds.has(r.course_id));
  if (!row) return null;
  return {
    candidateId: row.course_id,
    name: row.course_name,
    distanceM: row.distance_m,
    difficulty: row.difficulty,
    region: row.region,
    description: row.description,
    viewCount: Number(row.view_count ?? 0),
    likeCount: Number(row.like_count ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    reviewAverage: Number(row.review_average ?? 0)
  };
}

function popularity(c: Candidate): number {
  const ratingComponent = c.reviewCount > 0 ? c.reviewAverage : 0;
  return c.viewCount + c.likeCount * 2 + c.reviewCount * 2 + ratingComponent * 4;
}

function pickPopularSlot(pool: Candidate[], excludeCourseIds: Set<string>): Candidate | null {
  const eligible = pool.filter((c) => !excludeCourseIds.has(c.candidateId));
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => popularity(b) - popularity(a))[0];
}

async function insertRecommendationItem(
  recommendationId: string,
  rankNo: number,
  candidate: Candidate,
  preference: { preferredDistanceKm: number | null; difficulty: number | null; preferredEnvironment: string | null },
  allCandidates: Candidate[],
  reason: string
): Promise<void> {
  const scores = computeScores(
    {
      distanceM: candidate.distanceM,
      difficulty: candidate.difficulty,
      description: candidate.description,
      region: candidate.region,
      viewCount: candidate.viewCount,
      likeCount: candidate.likeCount,
      reviewCount: candidate.reviewCount,
      reviewAverage: candidate.reviewAverage
    },
    {
      preferredDistanceKm: preference.preferredDistanceKm,
      difficulty: preference.difficulty,
      preferredEnvironment: preference.preferredEnvironment
    },
    allCandidates.map((c) => ({
      distanceM: c.distanceM,
      difficulty: c.difficulty,
      description: c.description,
      region: c.region,
      viewCount: c.viewCount,
      likeCount: c.likeCount,
      reviewCount: c.reviewCount,
      reviewAverage: c.reviewAverage
    }))
  );

  const pool = getPool();
  await pool.query(
    `INSERT INTO course_recommendation.recommendation_items
       (recommendation_id, course_id, rank_no, score, distance_score, difficulty_score, environment_score, preference_score, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (recommendation_id, course_id) DO NOTHING`,
    [
      recommendationId,
      candidate.candidateId,
      rankNo,
      scores.score,
      scores.distanceScore,
      scores.difficultyScore,
      scores.environmentScore,
      scores.preferenceScore,
      reason
    ]
  );
}

// 홈/코스탐색 페이지 진입 시(로그인 상태) 호출한다. 오늘(KST 03:00 이후) 추천이 이미 있으면
// 아무 것도 안 하고 조용히 반환 — Bedrock을 다시 부르지 않는다.
export async function ensureTodaysRecommendation(userId: string): Promise<void> {
  if (await hasTodaysRecommendation(userId)) return;

  const dismissed = await getDismissedCourseIds(userId);
  const preference = await buildPreference(userId);
  const candidates = await getCandidatePool(dismissed);
  if (candidates.length === 0) return; // 추천할 후보 자체가 없음 (전부 dismiss했거나 코스가 없음)

  const requestBody = {
    owner_user_id: userId,
    location: { latitude: 37.5665, longitude: 126.978, address: null }, // TODO: 실제 GPS 연동 전까지 서울 시청 기준 고정값
    preference: {
      search_radius_km: 5.0,
      preferred_distance_km: preference.preferredDistanceKm,
      difficulty: preference.difficulty,
      preferred_environment: preference.preferredEnvironment,
      recommendation_type: preference.recommendationType
    },
    candidate_routes: candidates.map((c) => ({
      candidate_id: c.candidateId,
      name: c.name,
      distance_m: c.distanceM,
      difficulty: c.difficulty,
      region: c.region,
      description: c.description,
      view_count: c.viewCount,
      like_count: c.likeCount,
      review_count: c.reviewCount,
      review_average: c.reviewAverage,
      route_coordinates: []
    }))
  };

  let recommendationId: string;
  let aiPickedCourseId: string | null = null;
  try {
    const res = await fetch(`${AI_SERVICE_URL}/api/v1/ai-generated-courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      cache: 'no-store'
    });
    if (!res.ok) return; // AI 서비스 장애 시 조용히 스킵 — 화면은 기존 폴백(무작위 코스)으로 자연스럽게 대체됨
    const data = await res.json();
    recommendationId = data.recommendation_id;
    aiPickedCourseId = data.items?.[0]?.course_id ?? null;
  } catch {
    return;
  }

  const usedCourseIds = new Set(dismissed);
  if (aiPickedCourseId) usedCourseIds.add(aiPickedCourseId);

  const likedCandidate = await pickLikedSlot(userId, usedCourseIds);
  if (likedCandidate) {
    usedCourseIds.add(likedCandidate.candidateId);
    await insertRecommendationItem(
      recommendationId,
      2,
      likedCandidate,
      preference,
      candidates,
      '예전에 찜하신 코스라 다시 추천해드려요.'
    );
  }

  const popularCandidate = pickPopularSlot(candidates, usedCourseIds);
  if (popularCandidate) {
    await insertRecommendationItem(
      recommendationId,
      3,
      popularCandidate,
      preference,
      candidates,
      '지금 다른 러너들에게 가장 인기 있는 코스예요.'
    );
  }
}
