import { getPool } from './db.js';

// 로그인은 했지만 auth_user.user_running_preferences에 행이 아예 없는 사용자를 찾기 위한 용도.
// (AiRecoPanel/course_recommendation orchestrator가 이 값이 없으면 개인화 없이 인기순으로만 추천한다.)
// 이 스키마는 auth-service 소유라 이 서비스에서는 SELECT만 한다 — 실제 저장/조회 API는
// auth-service의 lib/routes runningPreferences.ts가 갖고 있다(이 파일엔 원래 그 두 함수의
// 사본이 있었는데 아무 라우트에서도 안 쓰이는 죽은 코드였다 — 삭제했다).
export async function hasRunningPreferences(userId: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT 1 FROM auth_user.user_running_preferences WHERE user_id = $1`, [userId]);
  return rows.length > 0;
}
