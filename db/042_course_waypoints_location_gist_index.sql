-- course.course_waypoints.location에 공간 인덱스가 없어서 /api/courses/nearby(ST_DWithin/ST_Distance)가
-- 매 요청마다 course_waypoints 전체를 순차 스캔하고 있었다. 현재 데이터량(수백 행)에서는 체감되지
-- 않지만, CLAUDE.md §5.4("주변 검색은 ST_DWithin, 공간 인덱스는 GIST를 사용한다")를 어기고 있고
-- 코스가 늘어날수록 지연으로 드러날 gap이라 미리 막아둔다.
CREATE INDEX IF NOT EXISTS idx_course_waypoints_location ON course.course_waypoints USING GIST (location);
