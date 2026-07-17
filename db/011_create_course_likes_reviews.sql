-- 코스 상세 페이지의 찜(좋아요)과 리뷰 기능을 위한 테이블.
-- user_id는 이 프로젝트가 이미 auth_user.users.user_id(UUID)를 세션 ID로 그대로 쓰고 있어
-- (running_record.runs.user_id와 동일 패턴) 여기서도 같은 방식을 따른다.

CREATE TABLE IF NOT EXISTS course.course_likes (
  course_id VARCHAR(50) NOT NULL REFERENCES course.courses(course_id),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS course.course_reviews (
  review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id VARCHAR(50) NOT NULL REFERENCES course.courses(course_id),
  user_id UUID NOT NULL,
  overall_rating NUMERIC(2,1) NOT NULL CHECK (overall_rating >= 0 AND overall_rating <= 5),
  surface_rating NUMERIC(2,1) CHECK (surface_rating >= 0 AND surface_rating <= 5),
  scenery_rating NUMERIC(2,1) CHECK (scenery_rating >= 0 AND scenery_rating <= 5),
  slope_rating NUMERIC(2,1) CHECK (slope_rating >= 0 AND slope_rating <= 5),
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_reviews_course_id ON course.course_reviews(course_id);
CREATE INDEX IF NOT EXISTS idx_course_likes_course_id ON course.course_likes(course_id);
