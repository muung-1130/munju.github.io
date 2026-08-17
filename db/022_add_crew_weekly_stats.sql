-- 크루 배틀에 참여하지 않는 크루도 "최근 7일 크루원 평균 km / 평균 페이스"를 크루 모집
-- 목록에서 참고할 수 있게 crew.crews에 캐시 컬럼을 추가한다. 이 값은 크루마다 멤버 수 x
-- running_record.runs를 훑어야 해서(크루 수가 늘어날수록 매 페이지 로드마다 계산하기엔
-- 무거워질 수 있음) 매일 자정(KST)에 별도 스케줄러(services/crew-stats-scheduler)가 갱신해두는
-- 캐시 값이다 — 실시간 값이 아니라 "최근 갱신 시각(stats_updated_at)" 기준의 스냅샷이다.
ALTER TABLE crew.crews
  ADD COLUMN IF NOT EXISTS avg_weekly_distance_m INTEGER,
  ADD COLUMN IF NOT EXISTS avg_weekly_pace_sec_per_km INTEGER,
  ADD COLUMN IF NOT EXISTS stats_updated_at TIMESTAMPTZ;
