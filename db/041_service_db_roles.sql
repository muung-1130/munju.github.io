-- 지금까지 12개 서비스 전부 동일한 Postgres superuser(kevin)로 접속했다 — 코드 경계를 나눠도
-- DB 계정단에서는 전혀 격리가 안 되어 있었다(SQL 인젝션이나 버그 하나가 DB 전체를 위협할 수 있는
-- 상태). 서비스별 최소권한 role을 만든다: 자기 소유 스키마는 SELECT/INSERT/UPDATE/DELETE,
-- 지금 실제로 읽기만 하고 있는 타 스키마는 SELECT만 부여한다(크로스 스키마 쓰기는 이미 이전
-- 마이그레이션들에서 전부 제거했다 — 남은 건 읽기 전용 조인뿐이다).
--
-- 비밀번호는 이 파일에 넣지 않는다(git에 커밋되는 파일이라 실제 비밀값을 담지 않는다).
-- CREATE ROLE ... LOGIN까지만 여기서 하고, 실제 ALTER ROLE ... PASSWORD는 별도로 psql에서
-- 직접 실행해 gitignore된 services-msa/.env에만 기록한다.
--
-- 실행: psql -h 192.168.0.212 -U kevin -d dai_run -f db/041_service_db_roles.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_svc') THEN CREATE ROLE auth_svc LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'course_svc') THEN CREATE ROLE course_svc LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'course_recommendation_svc') THEN CREATE ROLE course_recommendation_svc LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'running_record_svc') THEN CREATE ROLE running_record_svc LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crew_svc') THEN CREATE ROLE crew_svc LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coaching_svc') THEN CREATE ROLE coaching_svc LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_assistant_svc') THEN CREATE ROLE ai_assistant_svc LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'challenge_svc') THEN CREATE ROLE challenge_svc LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shoe_svc') THEN CREATE ROLE shoe_svc LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marathon_svc') THEN CREATE ROLE marathon_svc LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'media_svc') THEN CREATE ROLE media_svc LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'notification_svc') THEN CREATE ROLE notification_svc LOGIN; END IF;
END $$;

-- 모든 서비스가 PostGIS 확장(공용 함수/타입)이 있는 public 스키마를 참조할 수 있어야 한다.
-- 함수 EXECUTE 권한 자체는 기본 PUBLIC이지만, 스키마 USAGE는 명시적으로 필요하다.
GRANT USAGE ON SCHEMA public TO auth_svc, course_svc, course_recommendation_svc, running_record_svc,
  crew_svc, coaching_svc, ai_assistant_svc, challenge_svc, shoe_svc, marathon_svc, media_svc, notification_svc;

-- ---- 자기 소유 스키마: 전체 DML ----

GRANT USAGE ON SCHEMA auth_user TO auth_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth_user TO auth_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA auth_user TO auth_svc;

GRANT USAGE ON SCHEMA course TO course_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA course TO course_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA course TO course_svc;

GRANT USAGE ON SCHEMA course_recommendation TO course_recommendation_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA course_recommendation TO course_recommendation_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA course_recommendation TO course_recommendation_svc;

GRANT USAGE ON SCHEMA running_record TO running_record_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA running_record TO running_record_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA running_record TO running_record_svc;

GRANT USAGE ON SCHEMA crew TO crew_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA crew TO crew_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA crew TO crew_svc;
GRANT USAGE ON SCHEMA crew_chat TO crew_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA crew_chat TO crew_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA crew_chat TO crew_svc;

GRANT USAGE ON SCHEMA coaching TO coaching_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA coaching TO coaching_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA coaching TO coaching_svc;
GRANT USAGE ON SCHEMA environment TO coaching_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA environment TO coaching_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA environment TO coaching_svc;

GRANT USAGE ON SCHEMA ai_assistant TO ai_assistant_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai_assistant TO ai_assistant_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA ai_assistant TO ai_assistant_svc;

GRANT USAGE ON SCHEMA challenge TO challenge_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA challenge TO challenge_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA challenge TO challenge_svc;

GRANT USAGE ON SCHEMA shoe TO shoe_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shoe TO shoe_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA shoe TO shoe_svc;

GRANT USAGE ON SCHEMA marathon TO marathon_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA marathon TO marathon_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA marathon TO marathon_svc;

GRANT USAGE ON SCHEMA media TO media_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA media TO media_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA media TO media_svc;

GRANT USAGE ON SCHEMA notification TO notification_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA notification TO notification_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA notification TO notification_svc;
GRANT USAGE ON SCHEMA support TO notification_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA support TO notification_svc;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA support TO notification_svc;

-- ---- 코드에서 실제로 아직 읽고 있는 타 스키마: SELECT만 (신규 크로스 쓰기는 절대 금지) ----

GRANT USAGE ON SCHEMA auth_user TO course_svc, course_recommendation_svc, running_record_svc, crew_svc, challenge_svc, marathon_svc, notification_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA auth_user TO course_svc, course_recommendation_svc, running_record_svc, crew_svc, challenge_svc, marathon_svc, notification_svc;

GRANT USAGE ON SCHEMA running_record TO course_svc, crew_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA running_record TO course_svc, crew_svc;

GRANT USAGE ON SCHEMA course TO course_recommendation_svc, running_record_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA course TO course_recommendation_svc, running_record_svc;

GRANT USAGE ON SCHEMA shoe TO running_record_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA shoe TO running_record_svc;

GRANT USAGE ON SCHEMA crew TO challenge_svc, notification_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA crew TO challenge_svc, notification_svc;

-- ---- 앞으로 생성될 테이블에도 같은 권한이 자동으로 붙게(스키마 소유자 kevin/team4 어느 쪽이
-- 마이그레이션을 실행하든 커버되도록 둘 다 설정) — 그래도 새 마이그레이션 작성 시 새 테이블에
-- 대한 GRANT를 빠뜨리지 않았는지 확인하는 것이 안전하다(운영 주의사항으로 남겨둔다). ----

ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA auth_user GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auth_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA auth_user GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auth_svc;

ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA course GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO course_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA course GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO course_svc;

ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA course_recommendation GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO course_recommendation_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA course_recommendation GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO course_recommendation_svc;

ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA running_record GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO running_record_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA running_record GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO running_record_svc;

ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA crew GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crew_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA crew GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crew_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA crew_chat GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crew_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA crew_chat GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crew_svc;

ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA coaching GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO coaching_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA coaching GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO coaching_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA environment GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO coaching_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA environment GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO coaching_svc;

ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA ai_assistant GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_assistant_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA ai_assistant GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_assistant_svc;

ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA challenge GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO challenge_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA challenge GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO challenge_svc;

ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA shoe GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO shoe_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA shoe GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO shoe_svc;

ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA marathon GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO marathon_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA marathon GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO marathon_svc;

ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA media GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO media_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA media GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO media_svc;

ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA notification GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO notification_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA notification GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO notification_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE kevin IN SCHEMA support GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO notification_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE team4 IN SCHEMA support GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO notification_svc;
