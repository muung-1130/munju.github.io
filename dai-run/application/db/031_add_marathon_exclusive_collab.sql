-- 마라톤 독점 콜라보 대회 지원: 신청 정원(capacity)과 대기열(queue) 처리를 위한 컬럼을 추가한다.
-- 일반 대회는 지금처럼 정원 없이 신청만 받고, 독점 콜라보 대회만 capacity를 채우면
-- CONFIRMED 대신 WAITING으로 순번(queue_sequence_no, 기존 컬럼)이 매겨진다.

ALTER TABLE marathon.marathon_race
  ADD COLUMN IF NOT EXISTS is_exclusive_collab boolean NOT NULL DEFAULT false;

ALTER TABLE marathon.marathon_race
  ADD COLUMN IF NOT EXISTS capacity integer;

ALTER TABLE marathon.marathon_race
  ADD CONSTRAINT chk_marathon_race_capacity CHECK (capacity IS NULL OR capacity > 0);

CREATE INDEX IF NOT EXISTS idx_marathon_race_exclusive_collab
  ON marathon.marathon_race (is_exclusive_collab)
  WHERE is_exclusive_collab = true;

-- 8/28 독점 콜라보 대회 (데모용) + 접수창(registration_window) 등록.
-- capacity를 작게 잡은 건 실제 500명대 스파이크 없이도 CONFIRMED -> WAITING 전환을 바로 확인하기 위함.
INSERT INTO marathon.marathon_race
  (race_name, race_date, registration_start_date, registration_end_date, souvenir,
   race_distance, region, official_website, is_exclusive_collab, capacity)
VALUES
  ('DAI RUN 단독 초청 마라톤', '2026-08-28', '2026-07-20', '2026-08-20',
   'DAI RUN 굿즈 티셔츠 + 완주 메달', '풀', '서울', 'https://dairun.example.com/marathon/exclusive', true, 50)
ON CONFLICT DO NOTHING;

INSERT INTO marathon.marathon_registration_windows (race_id, opens_at, closes_at, status)
SELECT race_id, TIMESTAMPTZ '2026-07-21 10:00:00+09', TIMESTAMPTZ '2026-08-20 23:59:59+09', 'SCHEDULED'
  FROM marathon.marathon_race
 WHERE is_exclusive_collab = true AND race_date = '2026-08-28'
ON CONFLICT DO NOTHING;
