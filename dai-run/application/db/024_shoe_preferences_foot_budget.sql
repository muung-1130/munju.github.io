-- "선호 사용 환경"(로드/트레일/트랙/데일리/레이스) 슬라이더를 UI에서 완전히 없애기로 했다 —
-- 애초에 카탈로그에 트레일/트랙 전용 러닝화 데이터가 없어서 실제로 매칭할 데이터가 없었다.
-- preferred_surfaces 컬럼은 더 이상 어떤 화면에서도 쓰지 않으므로 제거한다. 대신 이미 컬럼은
-- 있었지만 UI가 없어 항상 비어있던 foot_type(발볼 선호)/budget_min/budget_max(예산)를
-- 실제로 채우기 시작한다 — 둘 다 shoe_spec.foot_width, shoe_price.price와 바로 매칭 가능해서
-- 추천 정확도에 더 도움이 된다.
ALTER TABLE shoe.user_shoe_preferences DROP COLUMN IF EXISTS preferred_surfaces;
