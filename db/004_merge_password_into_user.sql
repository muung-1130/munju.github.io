-- 003_create_user_auth.sql로 이미 적용된 "user" / user_credential 테이블을 수정합니다.
-- (이미 적용된 마이그레이션 파일은 그대로 두고, 변경 사항을 새 파일로 추가합니다.)
--
-- 변경 이유:
--   1) 비밀번호(password_hash)를 별도 테이블(user_credential)이 아니라 "user" 테이블에 직접 저장.
--   2) 로그인 아이디(user_name)와 별도로 실명을 받는 name 컬럼 추가.
--
-- 적용 전 두 테이블 모두 0 rows 확인함 (데이터 손실 없음).
-- 실행: psql -h <host> -U <user> -d <db> -f db/004_merge_password_into_user.sql

BEGIN;

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS provider_account_id TEXT;

-- user_credential에 남아있던 데이터가 있다면 user로 옮긴다 (현재는 0 rows).
UPDATE "user" u
SET password_hash = c.password_hash,
    auth_provider = c.provider,
    provider_account_id = c.provider_account_id
FROM user_credential c
WHERE c.user_id = u.user_id;

-- 테이블이 비어 있어 안전하게 NOT NULL로 승격 (기존 행이 있었다면 먼저 백필 필요).
ALTER TABLE "user" ALTER COLUMN name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_provider_account_idx
  ON "user" (auth_provider, provider_account_id)
  WHERE provider_account_id IS NOT NULL;

ALTER TABLE "user"
  ADD CONSTRAINT user_gender_check CHECK (gender IS NULL OR gender IN ('M', 'F')),
  ADD CONSTRAINT user_auth_provider_check CHECK (auth_provider IN ('local', 'google')),
  ADD CONSTRAINT user_credential_presence_check CHECK (
    (auth_provider = 'local' AND password_hash IS NOT NULL) OR
    (auth_provider = 'google' AND provider_account_id IS NOT NULL)
  );

DROP TABLE IF EXISTS user_credential;

COMMIT;

-- 롤백하려면: password_hash/auth_provider/provider_account_id/name 컬럼과 위 제약을 제거하고
-- 003_create_user_auth.sql의 user_credential 테이블을 다시 생성하면 된다 (데이터 없는 상태 기준).
