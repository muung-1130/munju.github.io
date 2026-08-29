-- Kafka는 at-least-once 전달이라 같은 run.completed 이벤트가 재전달될 수 있다. 다른 소비자들은
-- 이미 source_event_id UNIQUE로 멱등성을 보장하고 있는데(notification.notifications,
-- challenge.challenge_progress_events) ai_assistant.chat_messages만 빠져 있었다 — AI 코치
-- 축하 메시지가 재전달 시 중복 발송되는 걸 막기 위해 같은 패턴을 추가한다.
ALTER TABLE ai_assistant.chat_messages ADD COLUMN IF NOT EXISTS source_event_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_source_event
  ON ai_assistant.chat_messages (source_event_id) WHERE source_event_id IS NOT NULL;
