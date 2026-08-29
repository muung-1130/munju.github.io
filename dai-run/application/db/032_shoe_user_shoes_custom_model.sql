-- 러닝화 등록 시 "카탈로그 모델을 선택하지 않음"을 지원한다: 이 경우 shoe_model_id는 NULL이고,
-- 표시용 이름은 nickname(필수가 됨)으로, 썸네일은 사용자가 업로드한 마모 분석 사진 중 하나를
-- (custom_thumbnail_key, shoe-life-ai의 MinIO 객체 key) 그대로 재사용한다.

ALTER TABLE shoe.user_shoes
  ALTER COLUMN shoe_model_id DROP NOT NULL;

ALTER TABLE shoe.user_shoes
  ADD COLUMN IF NOT EXISTS custom_thumbnail_key text;

-- 카탈로그 모델이 없으면 화면에 보여줄 이름의 유일한 출처가 nickname이므로 반드시 있어야 한다.
ALTER TABLE shoe.user_shoes
  ADD CONSTRAINT chk_user_shoes_custom_needs_nickname
  CHECK (shoe_model_id IS NOT NULL OR nickname IS NOT NULL);
