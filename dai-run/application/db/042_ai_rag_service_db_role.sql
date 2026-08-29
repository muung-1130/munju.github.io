-- ai-rag-service(챗봇)는 자기 소유 스키마가 없다 -- environment/auth_user/course/
-- running_record/challenge를 읽기만 하는 순수 소비자다. 041_service_db_roles.sql과
-- 동일한 원칙: 실제로 코드가 읽고 있는 스키마에만 SELECT를 부여한다.
--
-- 비밀번호는 이 파일에 넣지 않는다(git에 커밋되는 파일이라 실제 비밀값을 담지 않는다).
-- CREATE ROLE ... LOGIN까지만 여기서 하고, 실제 ALTER ROLE ... PASSWORD는 별도로 psql에서
-- 직접 실행한다.
--
-- 실행: psql -h 192.168.0.212 -U kevin -d dai_run -f db/042_ai_rag_service_db_role.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_rag_svc') THEN CREATE ROLE ai_rag_svc LOGIN; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO ai_rag_svc;

GRANT USAGE ON SCHEMA environment TO ai_rag_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA environment TO ai_rag_svc;

GRANT USAGE ON SCHEMA auth_user TO ai_rag_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA auth_user TO ai_rag_svc;

GRANT USAGE ON SCHEMA course TO ai_rag_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA course TO ai_rag_svc;

GRANT USAGE ON SCHEMA running_record TO ai_rag_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA running_record TO ai_rag_svc;

GRANT USAGE ON SCHEMA challenge TO ai_rag_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA challenge TO ai_rag_svc;
