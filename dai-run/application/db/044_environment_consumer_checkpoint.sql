-- dir-environment-consumer(services/environment-dynamodb-consumer)를 매 polling마다
-- DynamoDB 전체 Scan에서 체크포인트 기반 증분 Scan으로 전환하기 위한 커서 테이블.
-- k8s/environment-consumer/README.md에서 권장한 "LastEvaluatedKey 체크포인트 방식 전환"의 구현이다.
-- weather_hourly/air_quality_hourly는 기존 db/007_environment_by_district.sql 소유 그대로 둔다.
CREATE TABLE IF NOT EXISTS environment.ingest_consumer_checkpoint (
    consumer_name text PRIMARY KEY,
    collected_at  timestamptz NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE environment.ingest_consumer_checkpoint IS
    'DynamoDB polling cursor; updated in the same transaction as destination upserts.';

-- environment_writer는 db/041_service_db_roles.sql의 12개 서비스 role 체계 밖에 있는
-- 별도 컨슈머 전용 계정이다(services/는 services-msa가 아니므로 §4.1 대상이 아님).
-- weather_hourly/air_quality_hourly에 이미 부여된 권한과 동일한 범위로 새 테이블도 맞춘다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'environment_writer') THEN
    GRANT SELECT, INSERT, UPDATE ON environment.ingest_consumer_checkpoint TO environment_writer;
  END IF;
END $$;
