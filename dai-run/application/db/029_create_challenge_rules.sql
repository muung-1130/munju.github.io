-- 챌린지 성공/진행 조건을 running_record.runs의 실제 컬럼과 1:1로 대응하는 nullable
-- min/max 컬럼으로 표현한다. NULL이면 그 조건은 검사하지 않는다(조건 없음).
--
-- Mongo가 아니라 Postgres를 선택한 이유(설계 보고):
--   1) 조건이 참조하는 대상이 running_record.runs라는 이미 고정된 스키마의 컬럼들이라,
--      진짜 "스키마가 얼마든지 달라지는" 문서형 데이터가 아니다 — distance_m, average_pace_sec_per_km,
--      average_heart_rate 등 몇 개 안 되는 알려진 숫자 컬럼의 조합일 뿐이라 정규화된 테이블로
--      충분히(그리고 더 안전하게, CHECK 제약까지 걸어서) 표현 가능하다.
--   2) challenge.challenges / challenge_participations / challenge_progress_events와 매 러닝
--      완료마다 같은 트랜잭션/쿼리 안에서 JOIN해서 조건을 검사해야 하는데, 이 세 테이블이 전부
--      이미 Postgres에 있다 — Mongo에 두면 매번 두 DB를 오가며 조건을 조합해야 해서 오히려 더 복잡해진다.
--   3) 그래도 못 담아내는 예외적인 조건(예: "아침 몇 시 이전에 시작한 러닝만 인정")을 위해
--      Postgres 자체의 jsonb(extra_conditions)를 escape hatch로 둔다 — 별도 DB 없이도
--      스키마 변경 없는 유연성은 이걸로 확보된다.

CREATE TABLE IF NOT EXISTS challenge.challenge_rules (
  rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL UNIQUE REFERENCES challenge.challenges(challenge_id) ON DELETE CASCADE,

  -- 이 러닝 기록이 챌린지 진행도에 반영되려면 만족해야 하는 조건들 (전부 NULL이면 조건 없음 = 완료된
  -- 러닝은 전부 인정).
  min_distance_m integer,
  max_distance_m integer,
  min_pace_sec_per_km integer,       -- average_pace_sec_per_km 기준. 값이 작을수록 더 빠른 페이스.
  max_pace_sec_per_km integer,
  min_duration_sec integer,
  max_duration_sec integer,
  min_avg_heart_rate smallint,
  max_avg_heart_rate smallint,
  min_avg_cadence smallint,
  min_elevation_gain_m numeric(7,2),
  allowed_source_types varchar(20)[],  -- 예: {'APP','WATCH'} — 지정하면 MANUAL 기록 등은 인정 안 함

  -- 위 컬럼들로 못 담는 예외 조건(예: 특정 시간대 시작, 특정 요일 등)을 위한 escape hatch.
  extra_conditions jsonb,

  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_challenge_rules_distance CHECK (min_distance_m IS NULL OR min_distance_m >= 0),
  CONSTRAINT chk_challenge_rules_distance_range
    CHECK (max_distance_m IS NULL OR min_distance_m IS NULL OR max_distance_m >= min_distance_m),
  CONSTRAINT chk_challenge_rules_pace CHECK (min_pace_sec_per_km IS NULL OR min_pace_sec_per_km > 0),
  CONSTRAINT chk_challenge_rules_pace_range
    CHECK (max_pace_sec_per_km IS NULL OR min_pace_sec_per_km IS NULL OR max_pace_sec_per_km >= min_pace_sec_per_km),
  CONSTRAINT chk_challenge_rules_duration_range
    CHECK (max_duration_sec IS NULL OR min_duration_sec IS NULL OR max_duration_sec >= min_duration_sec),
  CONSTRAINT chk_challenge_rules_hr_range
    CHECK (max_avg_heart_rate IS NULL OR min_avg_heart_rate IS NULL OR max_avg_heart_rate >= min_avg_heart_rate)
);

CREATE TRIGGER trg_challenge_rules_updated_at
  BEFORE UPDATE ON challenge.challenge_rules
  FOR EACH ROW EXECUTE FUNCTION challenge.update_modified_at();
