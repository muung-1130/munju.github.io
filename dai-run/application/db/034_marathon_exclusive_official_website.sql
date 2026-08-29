-- DAI RUN 단독 초청 마라톤의 "공식 홈페이지" 링크를 자체 마이크로사이트(/marathon/[raceId]/official)로 전환.
-- 기존에는 존재하지 않는 플레이스홀더 외부 URL(https://dairun.example.com/marathon/exclusive)을 가리키고 있었다.
UPDATE marathon.marathon_race
SET official_website = '/marathon/' || race_id || '/official'
WHERE is_exclusive_collab = true
  AND official_website = 'https://dairun.example.com/marathon/exclusive';
