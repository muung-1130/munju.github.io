-- 실시간 GPS 러닝 트래킹 기능에 필요한 두 가지 수정.
--
-- 1) running_record.runs.status에 STOPPED을 추가한다. 사용자가 요청한 "출발=진행중",
--    "취소=취소됨"은 이미 있는 IN_PROGRESS/CANCELLED 값과 의미가 같아 그대로 재사용하고,
--    "목적지 도착 전에 도착 버튼을 눌러 그때까지 기록만 저장"하는 경우만 기존 3개 상태로는
--    표현할 수 없는 새로운 개념이라 STOPPED를 추가한다.
ALTER TABLE running_record.runs DROP CONSTRAINT chk_status;
ALTER TABLE running_record.runs ADD CONSTRAINT chk_status
  CHECK (status::text = ANY (ARRAY['IN_PROGRESS','COMPLETED','CANCELLED','STOPPED']::text[]));

-- 2) running_record.run_samples가 recorded_at 기준 RANGE 파티션 테이블로 이미 만들어져 있는데
--    실제 파티션이 하나도 생성되어 있지 않아(0개) 지금 상태로는 어떤 행도 insert할 수 없었다
--    (실제로 insert 시도해서 "no partition of relation found for row" 에러 확인함). 파티션을
--    매번 미리 만들어두는 운영 자동화는 이번 범위 밖이라, 우선 모든 recorded_at을 받아주는
--    DEFAULT 파티션을 만들어 즉시 동작하게 한다.
CREATE TABLE IF NOT EXISTS running_record.run_samples_default
  PARTITION OF running_record.run_samples DEFAULT;
