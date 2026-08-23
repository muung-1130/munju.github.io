-- ai-rag-service(챗봇)의 main.py에 새로 추가한 build_crew_answer()가
-- crew.crews/crew.crew_members를 직접 SELECT한다. 042/044와 동일한 원칙으로
-- 실제로 코드가 읽는 스키마에만 USAGE + SELECT를 부여한다.
--
-- 주의: 이 프로젝트는 온프레미스(dairun-postgresql, dir-db-ns@dir-master1)와
-- EKS 운영(dir-postgresql, dir-db-ns@dir-main-eks)에 이름은 같지만 물리적으로
-- 다른 두 개의 ai_rag_svc 롤이 존재한다(042/044 적용 때 실제로 겪은 문제).
-- 이 마이그레이션은 반드시 두 곳 모두에 실행해야 한다.
--
-- 실행(온프레미스): psql -h 192.168.0.212 -U kevin -d dai_run -f db/045_ai_rag_service_crew_grant.sql
-- 실행(EKS): dir-db-ns의 CNPG primary(dir-postgresql-1 또는 -2 중 read-only가 아닌 쪽)에
--   psql -U postgres -d dai_run로 접속해 아래 GRANT를 그대로 실행

GRANT USAGE ON SCHEMA crew TO ai_rag_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA crew TO ai_rag_svc;
