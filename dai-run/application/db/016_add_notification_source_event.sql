-- Kafka 이벤트(crew.join-request-events)로 생성되는 알림의 at-least-once 중복 처리를 막기 위해
-- 이벤트 ID를 저장할 컬럼을 추가한다. 기존 notification.notifications 테이블은 그대로 두고
-- 컬럼만 추가하는 Expand 단계 변경이다.
ALTER TABLE notification.notifications
  ADD COLUMN IF NOT EXISTS source_event_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_source_event_id
  ON notification.notifications (source_event_id)
  WHERE source_event_id IS NOT NULL;
