-- course_recommendation 스키마(recommendation_runs/recommendation_items/recommendation_feedback)는
-- course-recommendation-ai(FastAPI, 우성) PR에서 이 저장소 밖의 별도 작업으로 실제 공유 DB에
-- 이미 만들어져 있었다. 이 마이그레이션은 그 기존 상태를 저장소 마이그레이션 이력에 반영만 하는
-- 것으로, CREATE ... IF NOT EXISTS만 사용해 이미 있는 운영 데이터에 영향이 없게 한다.

CREATE SCHEMA IF NOT EXISTS course_recommendation;

CREATE TABLE IF NOT EXISTS course_recommendation.recommendation_runs (
  recommendation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  latitude numeric(10,7),
  longitude numeric(11,7),
  request_location geometry(Point,4326),
  radius_m integer NOT NULL,
  requested_distance_m integer,
  context_snapshot jsonb,
  model_version character varying(50),
  status character varying(20) NOT NULL,
  processing_time_ms integer,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_processing_time CHECK (processing_time_ms IS NULL OR processing_time_ms >= 0),
  CONSTRAINT chk_recommendation_distance CHECK (requested_distance_m IS NULL OR requested_distance_m > 0),
  CONSTRAINT chk_recommendation_radius CHECK (radius_m > 0),
  CONSTRAINT chk_recommendation_status CHECK (status IN ('COMPLETED', 'FAILED')),
  CONSTRAINT chk_request_location CHECK (request_location IS NULL OR st_srid(request_location) = 4326)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_runs_created
  ON course_recommendation.recommendation_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_runs_location
  ON course_recommendation.recommendation_runs USING gist (request_location);
CREATE INDEX IF NOT EXISTS idx_recommendation_runs_user
  ON course_recommendation.recommendation_runs (user_id);
-- 사용자별 "가장 최근 추천" 조회(코스 탐색/홈 화면의 AI 추천 패널)가 자주 실행되므로 전용 인덱스를 둔다.
CREATE INDEX IF NOT EXISTS idx_recommendation_runs_user_created
  ON course_recommendation.recommendation_runs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS course_recommendation.recommendation_items (
  recommendation_id uuid NOT NULL
    REFERENCES course_recommendation.recommendation_runs (recommendation_id) ON DELETE CASCADE,
  course_id character varying(50) NOT NULL,
  rank_no smallint NOT NULL,
  score numeric(6,3),
  distance_score numeric(6,3),
  difficulty_score numeric(6,3),
  environment_score numeric(6,3),
  preference_score numeric(6,3),
  reason text,
  PRIMARY KEY (recommendation_id, course_id),
  CONSTRAINT chk_rank CHECK (rank_no > 0),
  CONSTRAINT uq_recommendation_rank UNIQUE (recommendation_id, rank_no)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_items_course
  ON course_recommendation.recommendation_items (course_id);

CREATE TABLE IF NOT EXISTS course_recommendation.recommendation_feedback (
  feedback_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL
    REFERENCES course_recommendation.recommendation_runs (recommendation_id) ON DELETE CASCADE,
  course_id character varying(50) NOT NULL,
  user_id uuid NOT NULL,
  feedback_type character varying(20) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_feedback_type CHECK (feedback_type IN ('CLICK', 'LIKE', 'START_RUN', 'DISMISS'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_course
  ON course_recommendation.recommendation_feedback (course_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created
  ON course_recommendation.recommendation_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user
  ON course_recommendation.recommendation_feedback (user_id);
-- "이 사용자가 이 코스를 DISMISS한 적 있는지" exists-체크(추천 패널에서 다시 노출 여부 판단)를
-- 자주 하게 되므로 복합 인덱스를 추가한다.
CREATE INDEX IF NOT EXISTS idx_feedback_user_course_type
  ON course_recommendation.recommendation_feedback (user_id, course_id, feedback_type);
