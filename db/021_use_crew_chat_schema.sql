-- crew.crew_chat는 이 세션 초반에 편의상 crew 스키마 안에 임시로 만든 테이블이었는데, 실제로는
-- crew_chat 스키마에 정식 chat_rooms 테이블이 이미 준비돼 있었다(사용됐어야 할 테이블이 비어
-- 있었던 게 그 증거). chat_rooms는 "크루당 방 1개" 메타데이터만 담당하고, 참가자별 상태는
-- 명세에 있던 crew_chat.chat_participant_states를 새로 만들어 담당하게 한다. 채팅 "내용"은
-- 지금처럼 MongoDB(room_id = crew_id)에 그대로 둔다 — chat_messages 테이블은 명세에는 있지만
-- 이 서비스는 메시지 본문을 MongoDB에 저장하기로 이미 정했으므로 만들지 않는다.
BEGIN;

CREATE TABLE IF NOT EXISTS crew_chat.chat_participant_states (
  room_id UUID NOT NULL REFERENCES crew_chat.chat_rooms(room_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LEFT')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_participant_states_user ON crew_chat.chat_participant_states (user_id);

-- 기존 crew.crew_chat 데이터를 새 구조로 옮긴다: 크루마다 방을 하나 보장하고, 참가자 상태를 채운다.
INSERT INTO crew_chat.chat_rooms (crew_id)
SELECT DISTINCT crew_id FROM crew.crew_chat
ON CONFLICT (crew_id) DO NOTHING;

INSERT INTO crew_chat.chat_participant_states (room_id, user_id, joined_at)
SELECT r.room_id, cc.user_id, cc.joined_at
  FROM crew.crew_chat cc
  JOIN crew_chat.chat_rooms r ON r.crew_id = cc.crew_id
ON CONFLICT (room_id, user_id) DO NOTHING;

DROP TABLE crew.crew_chat;

COMMIT;
