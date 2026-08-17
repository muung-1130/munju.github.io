-- 챌린지 상세 페이지의 "명예의 전당"(챌린지별 완료 횟수 랭킹)과 "실시간 참가자 진행률"
-- (참여일 최신순 정렬) 조회를 뒷받침하는 인덱스. 두 조회 모두 challenge_participations를
-- challenge_id로 필터링하므로 별도 집계 테이블 없이 이 인덱스만으로 충분하다
-- (판단 근거는 작업 보고 참고).
CREATE INDEX IF NOT EXISTS idx_challenge_participations_challenge_status
  ON challenge.challenge_participations (challenge_id, status);

CREATE INDEX IF NOT EXISTS idx_challenge_participations_challenge_joined
  ON challenge.challenge_participations (challenge_id, joined_at DESC);
