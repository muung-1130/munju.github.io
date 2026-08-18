import { getPool } from './db.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

// 온프레미스 사설 IP 기본값은 EKS 등 다른 네트워크에서는 도달 불가능해서 조용히 타임아웃나는
// 함정이 된다 — env var 누락을 기동 시점에 바로 드러내도록 fail-fast.
const AI_SERVICE_URL = requireEnv('AI_RECOMMENDATION_SERVICE_URL');
const DAILY_CUTOFF_HOUR = 3; // FastAPI 쪽 repository.py의 _todays_recommendation_cutoff와 동일 기준 (KST 03:00)
const AI_SERVICE_TIMEOUT_MS = 6000; // Bedrock 호출 예산(운영 실측 평균 4~5초 기준 여유를 둔 상한)

// 같은 프로세스 안에서 짧은 시간에 겹쳐 들어오는 요청(예: 페이지 SSR의 최초 조회와, 곧이어
// 브라우저가 GPS를 얻은 뒤 보내는 재조회)이 하루 첫 계산 시점에 사용자당 Bedrock을 각자
// 중복 호출하지 않도록 진행 중인 생성 Promise를 재사용한다. 여러 Pod/replica에 걸친 완전한
// 락은 아니다 — 그 경우는 DB advisory lock 등이 필요하지만, 지금은 단일 프로세스 내 가장 흔한
// 중복 호출만 막는다.
const inFlightRecommendations = new Map<string, Promise<void>>();

function runRecommendationOnce(key: string, task: () => Promise<void>): Promise<void> {
  const existing = inFlightRecommendations.get(key);
  if (existing) return existing;
  const promise = task().finally(() => inFlightRecommendations.delete(key));
  inFlightRecommendations.set(key, promise);
  return promise;
}

// 로그인은 했지만 user_running_preferences가 없는 사용자와, 아예 로그인하지 않은 방문자는
// 입력값이 사실상 동일(선호 없음)하므로 사람마다 따로 Bedrock을 부르지 않고 이 고정 UUID 아래
// "공용 기본 추천" 하나만 매일 계산해서 공유한다 — 실제 auth_user.users에 없는 값이지만
// course_recommendation 스키마는 user_id를 물리 FK가 아니라 논리 참조로만 쓰고 있어 문제없다.
export const GUEST_DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';
// 위치가 필수 입력은 아니지만(schemas.py의 preferred_distance_km처럼 optional), 그래도 아무 기준점 없이
// 넣는 것보다는 의미 있는 서울 중심부 지점을 쓰는 게 나아서 종로3가역 좌표를 기본 앵커로 쓴다.
const JONGNO_3GA_STATION = { latitude: 37.5703, longitude: 126.991 };

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

// "AI 추천 다시 받기" 버튼은 하루 최대 이 횟수만 허용한다. FastAPI가 매 요청의 context_snapshot에
// force_refresh 여부를 기록해두므로(repository.py), 페이지 첫 방문 때 자동으로 한 번 계산되는
// 초기 추천은 여기 포함되지 않고 사용자가 실제로 버튼을 눌러 재계산한 횟수만 센다.
export const DAILY_MANUAL_REFRESH_LIMIT = 3;

export async function getManualRefreshCountToday(userId: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count FROM course_recommendation.recommendation_runs
      WHERE user_id = $1 AND status = 'COMPLETED' AND created_at >= $2
        AND (context_snapshot->>'force_refresh')::boolean IS TRUE`,
    [userId, todaysCutoffUtc().toISOString()]
  );
  return Number(rows[0]?.count ?? 0);
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
  searchRadiusKm: number | null;
}> {
  const pool = getPool();

  const { rows: prefRows } = await pool.query<{
    preferred_distance_m: number | null;
    difficulty: string | null;
    preferred_scenery: string | null;
    search_radius_m: number | null;
    recommendation_type: string | null;
  }>(
    `SELECT preferred_distance_m, difficulty, preferred_scenery, search_radius_m, recommendation_type
       FROM auth_user.user_running_preferences WHERE user_id = $1`,
    [userId]
  );
  const profile = prefRows[0];
  const preferredDistanceKm = profile?.preferred_distance_m ? profile.preferred_distance_m / 1000 : null;
  const difficulty = profile?.difficulty ? DIFFICULTY_TO_INT[profile.difficulty] ?? null : null;
  const preferredEnvironment = profile?.preferred_scenery ?? null;
  const searchRadiusKm = profile?.search_radius_m ? profile.search_radius_m / 1000 : null;

  // 사용자가 "선호도 재설정" 모달에서 추천 기준을 직접 골랐으면 그 값을 그대로 쓰고, 피드백 기반
  // 자동 추론은 건너뛴다 — 명시적 사용자 입력이 있는데 과거 행동으로 덮어쓰지 않기 위함.
  if (profile?.recommendation_type) {
    return { preferredDistanceKm, difficulty, preferredEnvironment, recommendationType: profile.recommendation_type, searchRadiusKm };
  }

  // recommendation_type 추론: 이 사용자가 LIKE/START_RUN을 남긴 코스들의 점수 breakdown 중
  // 어떤 항목이 평균적으로 가장 높았는지로 "이 사람은 뭘 중요하게 보는지" 판단한다.
  // 데이터가 부족하면(3건 미만) 개인화할 근거가 없으므로 특정 축(거리)에 치우치지 않는
  // "인기 기반"을 기본값으로 쓴다 — 조회수/찜/리뷰/평점을 종합 반영해 무난하게 검증된 코스를 우선한다.
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

  let recommendationType = 'popular_based';
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

  return { preferredDistanceKm, difficulty, preferredEnvironment, recommendationType, searchRadiusKm };
}

// location/radiusKm이 주어지면 course.course_waypoints의 START 지점 기준 ST_DWithin으로 후보를
// 실제 반경 안으로 좁힌다 — course-service의 /api/courses/nearby(routes/courses.ts)가 쓰는 것과
// 동일한 조인/거리 predicate를 재사용한다. 반경 조건 없이(location 미상) 부를 수도 있는 경우를
// 대비해 location/radiusKm은 optional로 둔다.
async function getCandidatePool(
  excludeCourseIds: Set<string>,
  location?: { latitude: number; longitude: number },
  radiusKm?: number
): Promise<Candidate[]> {
  const pool = getPool();
  const conditions = [`c.visibility = 'PUBLIC'`, `c.status = 'ACTIVE'`, `c.deleted_at IS NULL`];
  const values: unknown[] = [];
  let joinClause = '';

  if (location && radiusKm) {
    values.push(location.latitude, location.longitude, radiusKm * 1000);
    joinClause = `JOIN course.course_waypoints w ON w.course_id = c.course_id AND w.waypoint_type = 'START'`;
    conditions.push(`ST_DWithin(w.location::geography, ST_MakePoint($2, $1)::geography, $3)`);
  }

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
       ${joinClause}
       LEFT JOIN course.course_statistics s ON s.course_id = c.course_id
      WHERE ${conditions.join(' AND ')}`,
    values
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

type RecommendationPreference = {
  preferredDistanceKm: number | null;
  difficulty: number | null;
  preferredEnvironment: string | null;
  recommendationType: string;
  searchRadiusKm: number | null;
};

// ensureTodaysRecommendation과 ensureGuestDefaultRecommendation이 공유하는 핵심 로직 — 후보 조회 후
// FastAPI(Bedrock)에 반경 안 후보를 넘겨 서로 다른 코스 최대 3개를 한 번에 고르게 한다. 결과 3건은
// FastAPI 쪽 save_recommendation_run()이 이미 course_recommendation.recommendation_items에
// rank_no 1~3으로 저장해두므로, 여기서는 recommendation_id만 확인하면 된다(찜/인기 슬롯을 여기서
// 별도로 채우던 로직은 제거했다 — 순수 AI 추천 3개로 바뀌었기 때문). 둘의 차이는 preference를
// 어떻게 구하는지(개인화 vs 고정 기본값)와 location뿐이다.
async function runRecommendation(
  userId: string,
  preference: RecommendationPreference,
  location: { latitude: number; longitude: number },
  dismissed: Set<string>,
  forceRefresh = false
): Promise<void> {
  const effectiveRadiusKm = preference.searchRadiusKm ?? 5.0;
  const candidates = await getCandidatePool(dismissed, location, effectiveRadiusKm);
  if (candidates.length === 0) return; // 추천할 후보 자체가 없음 (반경 안에 없거나 전부 dismiss했거나 코스가 없음)

  const requestBody = {
    owner_user_id: userId,
    location: { latitude: location.latitude, longitude: location.longitude, address: null },
    force_refresh: forceRefresh,
    preference: {
      search_radius_km: effectiveRadiusKm,
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

  // Bedrock 호출에 상한을 두지 않으면(운영 관측상 평균 4~5초, 느릴 때는 그 이상) 이 fetch가
  // 끝날 때까지 무한정 기다리게 된다 — "코스 탐색 페이지가 10초씩 멈춘다"는 지연 원인이었다.
  // 예산 안에 못 끝내면 abort하고 기존 폴백(무작위 코스)으로 조용히 넘어간다.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_SERVICE_TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_SERVICE_URL}/api/v1/ai-generated-courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      cache: 'no-store',
      signal: controller.signal
    });
    if (!res.ok) return; // AI 서비스 장애 시 조용히 스킵 — 화면은 기존 폴백(무작위 코스)으로 자연스럽게 대체됨
    // FastAPI가 이미 course_recommendation.recommendation_items에 rank_no 1~3(최대 3개, 서로 다른
    // 코스)을 전부 저장했다 — 여기서 추가로 찜/인기 슬롯을 채워 넣지 않는다.
    await res.json();
  } catch {
    // timeout(abort)이든 네트워크 오류든 동일하게 폴백으로 넘어간다.
  } finally {
    clearTimeout(timeoutId);
  }
}

// 홈/코스탐색 페이지 진입 시(로그인 + 선호도 보유 상태) 호출한다. 오늘(KST 03:00 이후) 추천이
// 이미 있으면 아무 것도 안 하고 조용히 반환 — Bedrock을 다시 부르지 않는다(하루 1회 제한).
// location은 브라우저 GPS로 구한 실제 좌표(AiRecoPanel이 client에서 넘겨줌)를 우선 쓰고,
// 아직 위치 권한을 못 받은 첫 SSR 조회 등에서는 서울 시청 좌표로 대체한다.
// forceRefresh=true("AI 추천 다시 받기" 버튼)면 하루 1회 제한을 건너뛰고 FastAPI에도
// force_refresh를 그대로 전달해 Bedrock을 다시 호출한다.
export function ensureTodaysRecommendation(
  userId: string,
  location: { latitude: number; longitude: number } = { latitude: 37.5665, longitude: 126.978 },
  forceRefresh = false,
  override?: { searchRadiusKm?: number; recommendationType?: string }
): Promise<void> {
  return runRecommendationOnce(userId, async () => {
    if (!forceRefresh && (await hasTodaysRecommendation(userId))) return;

    const dismissed = await getDismissedCourseIds(userId);
    const preference = await buildPreference(userId);
    // 지도 필터처럼 즉시 적용하는 반경/추천기준은 저장된 선호도 값 위에 이번 요청에만 덮어쓴다
    // (DB에 저장하지 않는다 — "선호도 재설정" 모달의 영구 저장과는 별개의, 세션성 필터다).
    if (override?.searchRadiusKm) preference.searchRadiusKm = override.searchRadiusKm;
    if (override?.recommendationType) preference.recommendationType = override.recommendationType;
    await runRecommendation(userId, preference, location, dismissed, forceRefresh);
  });
}

// 로그인했지만 선호도가 없는 사용자와 비로그인 방문자가 공유하는 "공용 기본 추천" — 매일 한 번만
// Bedrock을 호출해서 같은 결과를 재사용한다(중복 호출 방지). buildPreference처럼 개인화할 근거가
// 없으므로 선호값은 전부 비워두고, 위치만 종로3가역으로 고정한다.
export function ensureGuestDefaultRecommendation(): Promise<void> {
  return runRecommendationOnce(GUEST_DEFAULT_USER_ID, async () => {
    if (await hasTodaysRecommendation(GUEST_DEFAULT_USER_ID)) return;

    const preference: RecommendationPreference = {
      preferredDistanceKm: null,
      difficulty: null,
      preferredEnvironment: null,
      recommendationType: 'popular_based',
      searchRadiusKm: null
    };
    await runRecommendation(GUEST_DEFAULT_USER_ID, preference, JONGNO_3GA_STATION, new Set());
  });
}
