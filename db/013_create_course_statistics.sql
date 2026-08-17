-- 코스별 조회/좋아요/리뷰 집계 테이블. 조회수는 상세 페이지 진입 시 동기로, 좋아요 수는 Kafka
-- 이벤트를 통해 비동기로, 리뷰 평균/개수는 리뷰 등록 시 기존 값 기반 증분 계산으로 갱신한다.
CREATE TABLE IF NOT EXISTS course.course_statistics (
  course_id VARCHAR(50) PRIMARY KEY REFERENCES course.courses(course_id),
  view_count BIGINT NOT NULL DEFAULT 0,
  like_count BIGINT NOT NULL DEFAULT 0,
  review_average NUMERIC(5,3) NOT NULL DEFAULT 0,
  review_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
