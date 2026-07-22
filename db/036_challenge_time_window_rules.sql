-- 아침 러닝 챌린지처럼 "하루 중 특정 시간대에 시작한 러닝만 인정" 조건을 challenge_rules의
-- extra_conditions(jsonb) escape hatch 대신 정식 컬럼으로 표현한다. NULL이면 그 조건은 검사하지
-- 않는다(다른 min/max 컬럼과 동일한 원칙).
ALTER TABLE challenge.challenge_rules
  ADD COLUMN start_time_of_day time,
  ADD COLUMN end_time_of_day time;

ALTER TABLE challenge.challenge_series
  ADD COLUMN start_time_of_day time,
  ADD COLUMN end_time_of_day time;

-- "아침러닝 인증 챌린지" → "아침 러닝 챌린지"로 개명하고, extra_conditions의 임시값(before_hour_kst)을
-- 정식 시간대 컬럼(05:00~11:59:59)으로 교체한다.
UPDATE challenge.challenge_series
   SET name = '아침 러닝 챌린지',
       description = '아침(05:00-11:59)에 러닝을 시작하세요!',
       start_time_of_day = '05:00:00',
       end_time_of_day = '11:59:59',
       extra_conditions = NULL
 WHERE name = '아침러닝 인증 챌린지';

-- 이름뿐 아니라 설명도 이미 만들어진 이번 주 인스턴스(challenges 행)에 그대로 복사해야 한다 —
-- challenges.description은 challenge_series.description을 매주 생성 시점에 복사해두는 것일 뿐,
-- 시리즈를 나중에 고쳐도 이미 만들어진 인스턴스에는 자동 반영되지 않는다.
UPDATE challenge.challenges c
   SET name = s.name,
       description = s.description
  FROM challenge.challenge_series s
 WHERE c.series_id = s.series_id AND s.name = '아침 러닝 챌린지' AND c.name = '아침러닝 인증 챌린지';

UPDATE challenge.challenge_rules r
   SET start_time_of_day = '05:00:00',
       end_time_of_day = '11:59:59',
       extra_conditions = NULL
  FROM challenge.challenges c
  JOIN challenge.challenge_series s ON s.series_id = c.series_id
 WHERE r.challenge_id = c.challenge_id AND s.name = '아침 러닝 챌린지';

-- "주간 한강 20km 챌린지" → "주간 누적 20km 챌린지"로 개명(순수 누적 거리 목표, 코스 한정 없음).
UPDATE challenge.challenge_series
   SET name = '주간 누적 20km 챌린지',
       description = '이번 주 동안 누적 20km를 달려보세요.'
 WHERE name = '주간 한강 20km 챌린지';

UPDATE challenge.challenges c
   SET name = s.name,
       description = s.description
  FROM challenge.challenge_series s
 WHERE c.series_id = s.series_id AND s.name = '주간 누적 20km 챌린지' AND c.name = '주간 한강 20km 챌린지';
