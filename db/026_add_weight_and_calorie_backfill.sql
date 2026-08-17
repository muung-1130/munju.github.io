-- 러닝 기록의 칼로리 소모량을 추정하려면 체중 정보가 필요한데 지금까지는 어디에도 없었다
-- (auth_user.users에 성별/출생년도는 있지만 체중이 없었음). 회원가입에서 입력받고, 비워두면
-- 성별 기준 한국 성인 평균 체중(남 74kg / 여 58kg)을 기본값으로 저장한다 — 조건부 기본값이라
-- 컬럼 자체의 DEFAULT로는 표현할 수 없어 애플리케이션 코드(회원가입 라우트)에서 채운다.
ALTER TABLE auth_user.users ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5,2);

-- 기존 가입자들도 체중을 입력한 적이 없으니, 성별 기준 평균값으로 일단 채워둔다(나중에 마이페이지에서
-- 직접 수정 가능). 성별이 없는 경우 남녀 평균(66kg)을 쓴다.
UPDATE auth_user.users
   SET weight_kg = CASE gender WHEN 'M' THEN 74 WHEN 'F' THEN 58 ELSE 66 END
 WHERE weight_kg IS NULL;
