-- ai-rag-service(챗봇)의 main.py가 마라톤 일정 질문(build_marathon_answer)과 보유
-- 러닝화 질문(build_shoe_answer)에서 marathon/shoe 스키마를 직접 조회하는데,
-- 042_ai_rag_service_db_role.sql에는 이 두 스키마가 빠져 있었다. 실제로
-- "마라톤 일정 알려줘"가 502로 실패하는 원인을 라이브에서 확인했다:
-- psycopg2.errors.InsufficientPrivilege: permission denied for schema marathon
-- (shoe 스키마도 동일하게 permission denied 재현됨). 041/042와 동일한 원칙으로,
-- 실제로 코드가 읽고 있는 스키마에만 SELECT를 부여한다.
--
-- 실행: psql -h 192.168.0.212 -U kevin -d dai_run -f db/044_ai_rag_service_marathon_shoe_grants.sql

GRANT USAGE ON SCHEMA marathon TO ai_rag_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA marathon TO ai_rag_svc;

GRANT USAGE ON SCHEMA shoe TO ai_rag_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA shoe TO ai_rag_svc;
