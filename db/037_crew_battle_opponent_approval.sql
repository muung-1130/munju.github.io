-- 크루 배틀 신청을 제안한 크루(crew_a) 내부 승인만으로 바로 시작하지 않고, 상대 크루(crew_b)도
-- 24시간 안에 크루장 승인 또는 과반수 찬성으로 응답해야 실제로 시작되게 한다.
-- PENDING_OPPONENT = crew_a 내부 승인은 끝났고 crew_b의 응답을 기다리는 중.
-- expires_at이 지나도 crew_b가 응답하지 않으면 DECLINED로 자동 처리한다(응답 지연도 거절로 취급).
ALTER TABLE crew.crew_battles DROP CONSTRAINT crew_battles_status_check;
ALTER TABLE crew.crew_battles ADD CONSTRAINT crew_battles_status_check
  CHECK (status IN ('PROPOSED', 'PENDING_OPPONENT', 'ACTIVE', 'DECLINED', 'CANCELLED', 'COMPLETED'));

ALTER TABLE crew.crew_battles ADD COLUMN expires_at TIMESTAMPTZ;
