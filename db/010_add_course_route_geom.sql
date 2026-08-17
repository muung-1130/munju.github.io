-- course.courses에 지도용 정밀 경로(도보 길찾기 API로 보간한 LineString)를 저장할 컬럼을 추가한다.
-- course.course_waypoints는 사람이 읽는 의미있는 지점(START/VIA/END)만 담고, 실제 지도에 그릴
-- 촘촘한 경로는 이 컬럼에 별도로 저장한다 (running_record.runs.route_geom과 같은 패턴).
ALTER TABLE course.courses ADD COLUMN IF NOT EXISTS route_geom geometry(LineString, 4326);
CREATE INDEX IF NOT EXISTS idx_courses_route_geom ON course.courses USING GIST (route_geom);
