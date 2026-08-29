-- 관리자 페이지 접근 권한을 위한 시스템 전역 admin 플래그.
-- crew.crew_members.role(LEADER/MANAGER/MEMBER)은 크루 범위 권한이라 재사용할 수 없어
-- auth_user.users에 별도 컬럼을 추가한다. 기본값 false로 두어 기존 계정에는 영향이 없다(Expand).
ALTER TABLE auth_user.users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

UPDATE auth_user.users SET is_admin = true WHERE nickname = '관리자';
