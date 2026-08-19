import { getPool } from './db.js';

// 로그인은 했지만 auth_user.user_running_preferences에 행이 아예 없는 사용자를 찾기 위한 용도.
// (AiRecoPanel/course_recommendation orchestrator가 이 값이 없으면 개인화 없이 인기순으로만 추천한다.)
export async function hasRunningPreferences(userId: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT 1 FROM auth_user.user_running_preferences WHERE user_id = $1`, [userId]);
  return rows.length > 0;
}

export type RecommendationType = 'location_based' | 'distance_based' | 'difficulty_based' | 'popular_based';

export type RunningPreferences = {
  runningGoal: 'HEALTH' | 'DIET' | 'ENDURANCE' | 'MARATHON' | null;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | null;
  preferredDistanceM: number | null;
  preferredScenery: string | null;
  searchRadiusM: number | null;
  recommendationType: RecommendationType | null;
};

// 마이페이지 선호도 시각화, 설문 모달 프리필(수정 진입) 용도로 저장된 값을 그대로 돌려준다.
export async function getRunningPreferences(userId: string): Promise<RunningPreferences | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT running_goal, difficulty, preferred_distance_m, preferred_scenery, search_radius_m, recommendation_type
       FROM auth_user.user_running_preferences WHERE user_id = $1`,
    [userId]
  );
  if (rows.length === 0) return null;
  return {
    runningGoal: rows[0].running_goal,
    difficulty: rows[0].difficulty,
    preferredDistanceM: rows[0].preferred_distance_m,
    preferredScenery: rows[0].preferred_scenery,
    searchRadiusM: rows[0].search_radius_m,
    recommendationType: rows[0].recommendation_type
  };
}

// undefined인 필드는 "이번 요청에서 건드리지 않음", null은 "명시적으로 지움"을 뜻한다 —
// 선호도 설문 모달(러닝목표/숙련도/거리/환경 4개를 매번 전부 다시 제출)과 AI 추천 패널의
// 반경/추천기준 필터(그 둘만 부분적으로 저장)가 같은 저장 함수를 안전하게 같이 쓸 수 있어야
// 하기 때문 — 전에는 항상 6개 컬럼을 전부 덮어써서, 반경/추천기준만 저장하려 해도 나머지
// 필드가 전부 null로 밀리거나, 반대로 설문 모달로 저장할 때마다 반경/추천기준이 null로
// 사라지는 문제가 있었다.
export type OnboardingPreferencesInput = {
  runningGoal?: 'HEALTH' | 'DIET' | 'ENDURANCE' | 'MARATHON' | null;
  difficulty?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | null;
  preferredDistanceM?: number | null;
  preferredScenery?: string | null;
  searchRadiusM?: number | null;
  recommendationType?: RecommendationType | null;
};

const INPUT_TO_COLUMN: Record<keyof OnboardingPreferencesInput, string> = {
  runningGoal: 'running_goal',
  difficulty: 'difficulty',
  preferredDistanceM: 'preferred_distance_m',
  preferredScenery: 'preferred_scenery',
  searchRadiusM: 'search_radius_m',
  recommendationType: 'recommendation_type'
};

export async function saveOnboardingPreferences(userId: string, input: OnboardingPreferencesInput): Promise<void> {
  const pool = getPool();
  const providedKeys = (Object.keys(INPUT_TO_COLUMN) as (keyof OnboardingPreferencesInput)[]).filter(
    (key) => input[key] !== undefined
  );

  const columns = ['user_id', ...providedKeys.map((key) => INPUT_TO_COLUMN[key])];
  const values: unknown[] = [userId, ...providedKeys.map((key) => input[key] ?? null)];
  const placeholders = values.map((_, i) => `$${i + 1}`);
  const updateSet =
    (providedKeys.length > 0 ? providedKeys.map((key) => `${INPUT_TO_COLUMN[key]} = EXCLUDED.${INPUT_TO_COLUMN[key]}`).join(', ') + ', ' : '') +
    'updated_at = now()';

  await pool.query(
    `INSERT INTO auth_user.user_running_preferences (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     ON CONFLICT (user_id) DO UPDATE SET ${updateSet}`,
    values
  );
}
