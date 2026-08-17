-- 러닝화 등록/수정 폼에서 "이미 신은 거리" 입력을 없애기로 함에 따라 initial_distance_m 컬럼도
-- 제거한다. accumulated_distance_m은 그대로 0부터 누적된다.

ALTER TABLE shoe.user_shoes DROP CONSTRAINT IF EXISTS chk_user_shoes_distance;
ALTER TABLE shoe.user_shoes DROP COLUMN IF EXISTS initial_distance_m;
