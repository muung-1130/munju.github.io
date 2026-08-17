-- 크루 채팅방 "입장" 기록. 실제 대화 내용은 MongoDB에 저장하고(room_id = crew_id로 매칭),
-- 여기서는 누가 언제 그 채팅방에 들어왔는지만 관계형으로 남긴다.
CREATE TABLE IF NOT EXISTS crew.crew_chat (
  crew_id UUID NOT NULL REFERENCES crew.crews(crew_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (crew_id, user_id)
);
