-- 회원가입/로그인 기능을 위한 테이블 생성 스크립트
-- team4 DB (211.46.52.154)에서 psql 등으로 직접 실행해주세요:
--   psql -h 211.46.52.154 -U team4 -d <데이터베이스명> -f db/003_create_user_auth.sql

-- 요청하신 10개 컬럼 그대로 사용 (user_id는 자동 증가 PK, user_name이 로그인용 "아이디"에 해당)
CREATE TABLE IF NOT EXISTS "user" (
  user_id        BIGSERIAL PRIMARY KEY,
  user_name      TEXT NOT NULL UNIQUE,           -- 로그인 아이디
  user_email     TEXT NOT NULL UNIQUE,
  gender         TEXT,                            -- 'M' | 'F'
  birth_year     INTEGER,
  crew_id        BIGINT,
  dong           TEXT,
  nickname       TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'active',
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user 테이블은 10개 컬럼 그대로 유지하기로 했기 때문에,
-- 비밀번호 해시 / 로그인 방식(로컬 vs 구글)은 별도 보조 테이블에 저장합니다.
CREATE TABLE IF NOT EXISTS user_credential (
  user_id              BIGINT PRIMARY KEY REFERENCES "user" (user_id) ON DELETE CASCADE,
  provider             TEXT NOT NULL DEFAULT 'local',  -- 'local' | 'google'
  password_hash        TEXT,                            -- local 가입일 때만 사용 (bcrypt)
  provider_account_id  TEXT,                             -- google 계정 고유 id(sub) 등
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_credential_provider_account_idx
  ON user_credential (provider, provider_account_id)
  WHERE provider_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_dong_idx ON "user" (dong);
CREATE INDEX IF NOT EXISTS user_crew_id_idx ON "user" (crew_id);
