-- 폐쇄망 전환으로 juso.go.kr(도로명주소 API)를 더 이상 호출할 수 없어(§7.5, §19.4 인터넷 필요
-- 외부 연동 문제와 동일 맥락), 행정안전부 법정동코드 전체자료를 로컬 테이블로 적재해 그 위에서
-- 동 검색을 수행한다. course-service(/api/dong/search)가 유일한 소비자이므로 course 스키마에
-- 둔다.
--
-- 데이터 적재는 이 파일이 아니라 db/ingest-legal-dong-codes.mjs(로컬/Docker Compose) 또는
-- db/generate-legal-dong-codes-sql.mjs(EKS, kubectl exec로 흘려보낼 SQL 생성)가 담당한다.
-- 법정동코드 전체자료.txt는 저장소에 커밋하지 않는 런타임 데이터 파일이라 이 SQL만으로는
-- 채우지 않는다.
--
-- 실행(로컬/Docker Compose): psql -h 192.168.0.212 -U kevin -d dai_run -f db/045_course_legal_dong_codes.sql
-- 실행(EKS, CloudNativePG): bash scripts/apply-environment-checkpoint-schema-eks.sh db/045_course_legal_dong_codes.sql
--   (이 경로는 scripts/apply-environment-checkpoint-schema-eks.sh의 기본 PG_USER=postgres로 접속한다.
--   db/041의 ALTER DEFAULT PRIVILEGES는 kevin/team4가 만든 테이블에만 적용되므로, postgres가
--   테이블을 만드는 이 경로에서는 아래에 course_svc GRANT를 명시적으로 넣어 창조자 role과
--   무관하게 항상 권한이 맞도록 한다.)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS course.legal_dong_codes (
  code CHAR(10) PRIMARY KEY,
  sido TEXT NOT NULL,
  sigungu TEXT,
  dong TEXT,
  full_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legal_dong_codes_full_name_trgm_idx
  ON course.legal_dong_codes USING GIN (full_name gin_trgm_ops);

-- 창조자 role이 누구든(postgres/kevin/team4) course_svc가 확실히 접근하도록 명시적으로 GRANT한다
-- (db/041 코멘트가 스스로 권고하는 안전장치: "새 테이블에 대한 GRANT를 빠뜨리지 않았는지 확인").
GRANT SELECT, INSERT, UPDATE, DELETE ON course.legal_dong_codes TO course_svc;

COMMENT ON TABLE course.legal_dong_codes IS
  '행정안전부 법정동코드 전체자료. 폐쇄망에서 juso.go.kr 동 검색을 대체하는 로컬 참조 테이블. db/ingest-legal-dong-codes.mjs(로컬) 또는 db/generate-legal-dong-codes-sql.mjs(EKS)로 적재.';
COMMENT ON COLUMN course.legal_dong_codes.dong IS
  '최하위 행정구역명(읍/면/동/리). 시도 단위 행(예: "서울특별시")은 NULL — 동 검색 결과에서 제외한다.';
COMMENT ON COLUMN course.legal_dong_codes.is_active IS
  '원본 파일의 폐지여부 컬럼("존재" → true). 폐지된 행정동도 이력 조회를 위해 함께 보관하되, 검색 API는 is_active = true만 반환한다.';
