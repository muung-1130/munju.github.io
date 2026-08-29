-- auth-web의 소셜 로그인을 Google 직접 연동에서 AWS Cognito 경유 방식으로 전환하면서
-- (AWS 폐쇄망 환경에서 외부 IdP 핸드셰이크를 Cognito Hosted UI가 대신 처리),
-- auth_user.user_identities.provider 허용값에 'COGNITO'를 추가한다.
-- 기존 GOOGLE/KAKAO/NAVER 값은 그대로 유지한다(Expand 단계, 기존 데이터 없음).

ALTER TABLE auth_user.user_identities
  DROP CONSTRAINT chk_user_identities_provider;

ALTER TABLE auth_user.user_identities
  ADD CONSTRAINT chk_user_identities_provider
  CHECK (provider IN ('GOOGLE', 'KAKAO', 'NAVER', 'COGNITO'));
