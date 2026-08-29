-- AI 코스 추천 화면(AiRecoPanel의 "선호도 재설정" 모달)에서 사용자가 검색 반경과 추천 기준을
-- 직접 입력할 수 있게 한다. 지금까지 course-recommendation-service의 buildPreference()는
-- search_radius_km을 5.0으로 하드코딩하고(실제 후보 조회에는 반영조차 되지 않았음),
-- recommendation_type은 사용자 피드백으로만 자동 추론했다 — 사용자가 원할 때 이 두 값을 직접
-- 고정할 수 있는 저장소가 없었다. 두 컬럼 모두 NULL을 "설정 안 함"으로 두어, 기존 자동 동작을
-- 그대로 보존하는 하위 호환 Expand migration이다.
--
-- course-recommendation-service(course_recommendation_svc role)는 이미
-- db/041_service_db_roles.sql(95-96행)에서 auth_user 스키마 전체 테이블에 대한 SELECT 권한을
-- 갖고 있으므로, 기존 테이블에 컬럼만 추가하는 이 migration은 GRANT 변경이 필요 없다.
--
-- 실행: psql -h 192.168.0.212 -U kevin -d dai_run -f db/043_user_running_preferences_ai_controls.sql

ALTER TABLE auth_user.user_running_preferences
  ADD COLUMN IF NOT EXISTS search_radius_m INTEGER NULL,
  ADD COLUMN IF NOT EXISTS recommendation_type VARCHAR NULL;

ALTER TABLE auth_user.user_running_preferences
  ADD CONSTRAINT user_running_preferences_recommendation_type_check
    CHECK (recommendation_type IS NULL OR recommendation_type IN ('location_based', 'distance_based', 'difficulty_based', 'popular_based'));

ALTER TABLE auth_user.user_running_preferences
  ADD CONSTRAINT user_running_preferences_search_radius_m_check
    CHECK (search_radius_m IS NULL OR search_radius_m > 0);

COMMENT ON COLUMN auth_user.user_running_preferences.search_radius_m IS
  'AI 추천 코스 검색 반경(m). 프리셋 1/3/5/10km(=1000/3000/5000/10000). NULL이면 서버 기본값을 사용한다.';
COMMENT ON COLUMN auth_user.user_running_preferences.recommendation_type IS
  'AI 추천 기준(location_based/distance_based/difficulty_based/popular_based). NULL이면 사용자 피드백 기반 자동 추론을 유지한다.';
