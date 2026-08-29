-- challenge-service가 챌린지 완주 알림(ChallengeCompleted)을 notification-service에 넘길 때
-- 지금까지처럼 notification.notifications에 직접 INSERT하지 않고(스키마 소유권 위반) Kafka
-- 이벤트로 발행한다. running_record.outbox_events(db/039)와 동일한 패턴.
CREATE TABLE IF NOT EXISTS challenge.outbox_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic VARCHAR(200) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_challenge_outbox_unpublished
  ON challenge.outbox_events (occurred_at)
  WHERE published_at IS NULL;
