-- 공개 챌린지를 "매주 월~일 자동 반복" 구조로 전환한다.
--
-- challenge.challenge_series는 반복 템플릿(이름/지표/목표값/세부 조건)만 들고 있고, 실제로 화면에
-- 노출되고 참여가 이뤄지는 건 지금처럼 challenge.challenges의 개별 "이번 주" row다. 매주 월요일마다
-- challenge-weekly-scheduler가 이 템플릿으로 새 challenges/challenge_rules row를 만들고, 이전 주
-- 참여자를 새 주차로 이관한다.

CREATE TABLE challenge.challenge_series (
  series_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  varchar(150) NOT NULL,
  description           text,
  metric_type           varchar(20) NOT NULL,
  target_value          numeric(12,2) NOT NULL,
  visibility            varchar(20) NOT NULL DEFAULT 'PUBLIC',
  creator_user_id       uuid NOT NULL,
  crew_id               uuid,
  is_active             boolean NOT NULL DEFAULT true,
  -- challenge.challenge_rules와 동일한 컬럼 — 매주 새 인스턴스 생성 시 그대로 복사된다.
  min_distance_m        integer,
  max_distance_m        integer,
  min_pace_sec_per_km   integer,
  max_pace_sec_per_km   integer,
  min_duration_sec      integer,
  max_duration_sec      integer,
  min_avg_heart_rate    smallint,
  max_avg_heart_rate    smallint,
  min_avg_cadence       smallint,
  min_elevation_gain_m  numeric(7,2),
  allowed_source_types  varchar(20)[],
  extra_conditions      jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_challenge_series_metric_type
    CHECK (metric_type = ANY (ARRAY['DISTANCE','COUNT','PACE','STREAK'])),
  CONSTRAINT chk_challenge_series_visibility
    CHECK (visibility = ANY (ARRAY['PUBLIC','PRIVATE','CREW_ONLY'])),
  CONSTRAINT chk_challenge_series_target_value CHECK (target_value > 0)
);

CREATE TRIGGER trg_challenge_series_updated_at
  BEFORE UPDATE ON challenge.challenge_series
  FOR EACH ROW EXECUTE FUNCTION challenge.update_modified_at();

-- challenges row가 어느 시리즈의 "이번 주" 인스턴스인지 연결한다. NULL이면 개인 챌린지이거나
-- 이 시스템 이전의 일회성 공개 챌린지.
ALTER TABLE challenge.challenges
  ADD COLUMN series_id uuid REFERENCES challenge.challenge_series(series_id);

CREATE INDEX idx_challenges_series ON challenge.challenges (series_id, start_at DESC);

-- 참여 신청 시점이 이번 주 월요일이 아니면 곧바로 ACTIVE가 되지 못하고 다음 턴(다음 주 인스턴스)
-- 까지 대기한다.
ALTER TABLE challenge.challenge_participations
  DROP CONSTRAINT chk_challenge_participation_status;
ALTER TABLE challenge.challenge_participations
  ADD CONSTRAINT chk_challenge_participation_status
  CHECK (status = ANY (ARRAY['ACTIVE','COMPLETED','CANCELLED','FAILED','WAITING']));

-- 기존 5개 공개 챌린지를 시리즈 템플릿으로 옮긴다. 이름/목표값은 "30일"·"200km" 같은 월 단위
-- 표현을 주간 단위로 조정했고, 러닝 기록에 적용되는 세부 조건(min_distance_m 등)은 기존
-- challenge.challenge_rules에 실제로 걸려있던 값 그대로 옮긴다.
INSERT INTO challenge.challenge_series
  (series_id, name, description, metric_type, target_value, creator_user_id,
   min_distance_m, max_distance_m, min_pace_sec_per_km, max_pace_sec_per_km,
   min_duration_sec, max_duration_sec, min_avg_heart_rate, max_avg_heart_rate,
   min_avg_cadence, min_elevation_gain_m, allowed_source_types, extra_conditions)
SELECT
  gen_random_uuid(),
  CASE c.name
    WHEN '30일 5K 완주 챌린지' THEN '주간 5K 완주 챌린지'
    WHEN '한강 종주 200km' THEN '주간 한강 20km 챌린지'
    ELSE c.name
  END,
  c.description,
  c.metric_type,
  CASE c.name
    WHEN '30일 5K 완주 챌린지' THEN 15
    WHEN '한강 종주 200km' THEN 20
    WHEN '아침러닝 인증 챌린지' THEN 4
    ELSE c.target_value
  END,
  c.creator_user_id,
  r.min_distance_m, r.max_distance_m, r.min_pace_sec_per_km, r.max_pace_sec_per_km,
  r.min_duration_sec, r.max_duration_sec, r.min_avg_heart_rate, r.max_avg_heart_rate,
  r.min_avg_cadence, r.min_elevation_gain_m, r.allowed_source_types, r.extra_conditions
FROM challenge.challenges c
LEFT JOIN challenge.challenge_rules r ON r.challenge_id = c.challenge_id
WHERE c.challenge_type = 'PUBLIC' AND c.visibility = 'PUBLIC';

-- 기존(월 단위) 인스턴스는 새 시스템으로 넘어가지 않으므로 은퇴시킨다 — 참여 기록/이벤트는 그대로
-- 보존되고, 목록(getPublicChallenges)에서는 CANCELLED가 필터링되어 더는 보이지 않는다.
UPDATE challenge.challenges
   SET status = 'CANCELLED'
 WHERE challenge_type = 'PUBLIC' AND visibility = 'PUBLIC';
