-- 크루 배틀: 크루 대 크루의 1주일 단위 거리/페이스 대결.
-- 매일 점수(크루원 평균 km 또는 평균 페이스)는 running_record.runs에서 그때그때 라이브로
-- 계산하므로(집계 테이블 없이 SUM/AVG 쿼리) 별도 일별 점수 테이블은 두지 않는다. 다만
-- "전날 결과를 채팅방에 한 번만 공지" 같은 멱등 처리를 위해 이벤트 발행 여부만 기록해둔다.
CREATE TABLE crew.crew_battles (
  battle_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type VARCHAR(20) NOT NULL CHECK (metric_type IN ('DISTANCE', 'PACE')),
  crew_a_id UUID NOT NULL REFERENCES crew.crews(crew_id),
  crew_b_id UUID NOT NULL REFERENCES crew.crews(crew_id),
  status VARCHAR(20) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'ACTIVE', 'DECLINED', 'CANCELLED', 'COMPLETED')),
  proposed_by_user_id UUID NOT NULL,
  start_date DATE,
  end_date DATE,
  winner_crew_id UUID REFERENCES crew.crews(crew_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CHECK (crew_a_id <> crew_b_id)
);
CREATE INDEX idx_crew_battles_crew_a_status ON crew.crew_battles (crew_a_id, status);
CREATE INDEX idx_crew_battles_crew_b_status ON crew.crew_battles (crew_b_id, status);

CREATE TABLE crew.crew_battle_votes (
  battle_id UUID NOT NULL REFERENCES crew.crew_battles(battle_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('AGREE', 'DISAGREE')),
  voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (battle_id, user_id)
);

-- event_key 예: 'STARTED', 'DECLINED', 'DAY_RESULT_2026-07-17', 'FINISHED'
-- 같은 이벤트가 폴링 중복 등으로 두 번 처리돼도 채팅 공지가 중복되지 않도록 막는다.
CREATE TABLE crew.crew_battle_chat_events (
  battle_id UUID NOT NULL REFERENCES crew.crew_battles(battle_id) ON DELETE CASCADE,
  event_key VARCHAR(40) NOT NULL,
  announced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (battle_id, event_key)
);
