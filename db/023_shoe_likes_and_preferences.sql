-- shoe 스키마 재검토 결과: shoe_catalog(정체성)/shoe_spec(1:1 스펙)/shoe_price(1:N 판매처별 가격)/
-- shoe_function+shoe_function_map(M:N 태그)로 이미 정상적으로 정규화되어 있어 별도 통폐합은
--하지 않는다(자세한 근거는 대화 응답 참고). 다만 이번에 필요한 두 가지만 추가한다:
--   1) 러닝화 찜(하트) 기능 — course.course_likes와 동일한 형태의 관계 테이블.
--   2) "나에게 맞는 러닝화 찾기" 퀴즈의 "주행 거리(단거리~장거리)" 슬라이더를 저장할 컬럼이
--      기존 user_shoe_preferences에 없어서 하나 추가한다.
CREATE TABLE IF NOT EXISTS shoe.shoe_likes (
  shoe_id BIGINT NOT NULL REFERENCES shoe.shoe_catalog(shoe_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shoe_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_shoe_likes_shoe_id ON shoe.shoe_likes (shoe_id);
CREATE INDEX IF NOT EXISTS idx_shoe_likes_user_id ON shoe.shoe_likes (user_id);

ALTER TABLE shoe.user_shoe_preferences
  ADD COLUMN IF NOT EXISTS distance_preference SMALLINT CHECK (distance_preference IS NULL OR (distance_preference BETWEEN 1 AND 5));
