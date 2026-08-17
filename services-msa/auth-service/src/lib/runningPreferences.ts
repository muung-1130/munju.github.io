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

export type OnboardingPreferencesInput = {
  runningGoal: 'HEALTH' | 'DIET' | 'ENDURANCE' | 'MARATHON' | null;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | null;
  preferredDistanceM: number | null;
  preferredScenery: string | null;
  searchRadiusM: number | null;
  recommendationType: RecommendationType | null;
};

// 코스탐색 온보딩 설문(버튼 클릭형) 저장 — 값이 없는 항목은 null로 남겨두고, 나머지 컬럼
// (페이스/주간거리/노면/심박수 등)은 나중에 마이페이지 설정 등에서 채울 수 있게 비워둔다.
export async function saveOnboardingPreferences(userId: string, input: OnboardingPreferencesInput): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO auth_user.user_running_preferences
       (user_id, running_goal, difficulty, preferred_distance_m, preferred_scenery, search_radius_m, recommendation_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       running_goal = EXCLUDED.running_goal,
       difficulty = EXCLUDED.difficulty,
       preferred_distance_m = EXCLUDED.preferred_distance_m,
       preferred_scenery = EXCLUDED.preferred_scenery,
       search_radius_m = EXCLUDED.search_radius_m,
       recommendation_type = EXCLUDED.recommendation_type,
       updated_at = now()`,
    [
      userId,
      input.runningGoal,
      input.difficulty,
      input.preferredDistanceM,
      input.preferredScenery,
      input.searchRadiusM,
      input.recommendationType
    ]
  );
}
