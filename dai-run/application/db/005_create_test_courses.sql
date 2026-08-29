-- test.courses: 코스 탐색/상세 페이지용 코스 테이블.
-- 공유 dai_run DB의 course 스키마는 team4가 소유한 running_course / running_course_point가
-- 이미 있어 충돌을 피하기 위해 이 프로젝트 전용 test 스키마에 별도로 만든다.
-- owner_user_id는 Auth/User 서비스 소유 데이터라 FK 없이 외부 참조 값으로만 저장한다.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS test;

CREATE TABLE IF NOT EXISTS test.courses (
    course_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id          UUID,
    name                   VARCHAR(150) NOT NULL,
    description            TEXT,
    source_type            VARCHAR(20) NOT NULL,
    route_geom             geometry(LineString, 4326) NOT NULL,
    start_point            geometry(Point, 4326) NOT NULL,
    end_point              geometry(Point, 4326) NOT NULL,
    centroid               geometry(Point, 4326) NOT NULL,
    distance_m             INTEGER NOT NULL CHECK (distance_m > 0),
    max_slope_pct          NUMERIC(5,2) DEFAULT 0,
    average_slope_pct      NUMERIC(5,2) DEFAULT 0,
    difficulty             SMALLINT CHECK (difficulty BETWEEN 1 AND 3), -- 1=쉬움, 2=보통, 3=어려움
    region                 VARCHAR(20),
    visibility             VARCHAR(20) NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
    status                 VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS courses_route_geom_gix ON test.courses USING GIST (route_geom);
CREATE INDEX IF NOT EXISTS courses_centroid_gix ON test.courses USING GIST (centroid);
