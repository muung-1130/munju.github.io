-- challenge_participations에 (challenge_id, user_id) UNIQUE 제약이 이미 있어(uq_challenge_user)
-- 같은 챌린지를 같은 사용자가 두 번 완료할 수 없다는 걸 뒤늦게 확인했다. 그래서 "각 챌린지
-- 상세 페이지의 명예의 전당"은 "이 챌린지 참가자들 중 지금까지 챌린지를 완주한 총 횟수" 랭킹으로
-- 설계했고, 이 전역 집계(사용자별 COMPLETED 개수)를 빠르게 하기 위한 인덱스다.
CREATE INDEX IF NOT EXISTS idx_challenge_participations_user_status
  ON challenge.challenge_participations (user_id, status);
