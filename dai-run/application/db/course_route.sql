-- course_route: PostGIS 기반 코스 GPS 경유점 저장 (course 테이블과 1:N)
-- course 테이블은 기존 ERD의 course_id, course_name, user_id, favorite_count, distance, difficulty 컬럼을 그대로 사용한다.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE course_route (
  id          BIGSERIAL PRIMARY KEY,
  course_id   BIGINT NOT NULL REFERENCES course (course_id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,                     -- 코스 내 경유점 순서 (0부터 시작)
  point       GEOMETRY(Point, 4326) NOT NULL,        -- WGS84 (lng, lat)
  source      TEXT NOT NULL DEFAULT 'map_api',       -- 'anchor'(직접 저장) | 'map_api'(경유점 보간으로 채움)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (course_id, seq)
);

CREATE INDEX course_route_point_gix ON course_route USING GIST (point);
CREATE INDEX course_route_course_id_idx ON course_route (course_id);

-- 저장 흐름 (구현 예정)
-- 1) 코스를 등록할 때는 일부 앵커 포인트만 저장한다 (source = 'anchor').
-- 2) 서버가 앵커 포인트 사이 구간을 지도/경로 API(OSRM, 카카오모빌리티, 네이버 길찾기 등)에 질의해
--    실제 도로/산책로를 따르는 세부 경유점을 받아온다.
-- 3) 응답받은 세부 경유점을 source = 'map_api'로 표시해 course_route에 함께 저장한다.
-- 4) 프론트엔드는 course_id로 course_route 전체를 seq 순으로 조회해 지도 위에 폴리라인으로 그린다.
--    (현재 프론트엔드 데모는 이 조회 결과 대신 임의의 좌표를 사용한다: components/CourseRouteSection.tsx)
