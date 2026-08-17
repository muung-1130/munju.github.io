-- running-record-service가 RunCompleted를 발행할 때 지금까지는 DB 커밋 후 Kafka produce()를
-- fire-and-forget으로 호출했다 — 커밋과 발행 사이에 프로세스가 죽으면 이벤트가 조용히 유실된다.
-- Outbox 패턴: 업무 데이터 갱신과 같은 트랜잭션 안에서 이 테이블에 이벤트를 적재하고,
-- 별도 publisher 프로세스가 published_at IS NULL인 행만 폴링해서 Kafka로 내보낸 뒤 표시한다.
CREATE TABLE IF NOT EXISTS running_record.outbox_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic VARCHAR(200) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- publisher의 폴링 쿼리(WHERE published_at IS NULL ORDER BY occurred_at)가 쓸 부분 인덱스.
CREATE INDEX IF NOT EXISTS idx_running_record_outbox_unpublished
  ON running_record.outbox_events (occurred_at)
  WHERE published_at IS NULL;
