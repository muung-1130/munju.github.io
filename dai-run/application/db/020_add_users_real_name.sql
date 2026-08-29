-- 회원가입 폼은 처음부터 "이름"(실명, 닉네임과 별개)을 필수로 받아서 검증까지 하는데,
-- auth_user.users에 담을 컬럼이 없어서 그 값이 그냥 버려지고 있었다. 실명은 닉네임과
-- 의미가 다르므로 별도 컬럼으로 추가한다. 구글 로그인 가입자는 이 값을 받지 않으니(성별/
-- 출생년도/동과 같은 패턴) NULL 허용으로 둔다.
ALTER TABLE auth_user.users ADD COLUMN IF NOT EXISTS real_name VARCHAR(50);
