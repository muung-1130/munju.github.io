-- 비밀번호 재설정 이메일 인증 코드. 코드는 짧은 시간만 유효하고 1회용이다.
CREATE TABLE IF NOT EXISTS auth_user.password_reset_codes (
  code_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_user.users(user_id),
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_id ON auth_user.password_reset_codes(user_id);
