-- 고객센터 1:1 문의 게시판. 기존 16개 서비스 스키마 중 이 용도에 맞는 스키마가 없어서(notification은
-- 알림 발송 상태만 다룸) support 스키마를 새로 만든다. 제목/닉네임은 목록에서 누구나 볼 수 있고,
-- 문의 내용(content)과 답변(admin_reply)은 작성자 본인과 admin 계정만 볼 수 있게 API 단에서 막는다
-- (이 서비스에는 별도 역할(role) 컬럼이 없어서 지금까지 해온 대로 user_name='admin' 계정을 관리자로
-- 취급한다).
CREATE SCHEMA IF NOT EXISTS support;

CREATE OR REPLACE FUNCTION support.update_modified_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$;

CREATE TABLE IF NOT EXISTS support.inquiries (
  inquiry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ANSWERED', 'CLOSED')),
  admin_reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_inquiries_user ON support.inquiries (user_id);
CREATE INDEX IF NOT EXISTS idx_support_inquiries_created ON support.inquiries (created_at DESC);

DROP TRIGGER IF EXISTS trg_support_inquiries_updated_at ON support.inquiries;
CREATE TRIGGER trg_support_inquiries_updated_at
  BEFORE UPDATE ON support.inquiries
  FOR EACH ROW EXECUTE FUNCTION support.update_modified_at();
