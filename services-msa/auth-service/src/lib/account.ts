import { getPool } from './db.js';
import { leaveCrew } from './crew.js';

// 회원 탈퇴: auth_user.users는 물리 삭제하지 않고 소프트 삭제(status='WITHDRAWN' + deleted_at)만
// 한다. auth_user 스키마 밖(크루/코스/챌린지/러닝기록/크루채팅)은 이 user_id를 물리 FK 없이
// 논리 참조만 하고 있어서 DB 차원의 CASCADE가 전혀 안 걸린다 — 만약 이 행을 진짜로 지워버리면
// 다른 서비스가 갖고 있는 과거 기록(코스 리뷰, 챌린지 완주 이력, 크루 채팅 로그 등)이 참조
// 무결성 없이 붕 뜬 채로 남는다. 로그인·아이디/닉네임 중복확인 등은 이미 전부 deleted_at IS NULL
// 조건을 걸고 있어서 이 값만 세팅해도 즉시 "존재하지 않는 계정"처럼 동작한다.
//
// 실무에서는 보통 탈퇴 후 몇 개월(정책에 따라 다름)은 분쟁 대응·부정 재가입 방지 등을 위해
// 계정을 완전히 지우지 않고 보존했다가, 배치 작업으로 개인정보만 익명화하거나 그때 가서
// 완전 삭제한다. 그 배치는 이번 범위 밖이라 만들지 않지만, deleted_at을 기준 시각으로
// 남겨두면 나중에 "deleted_at이 N개월 지난 WITHDRAWN 계정" 조건으로 그 배치를 붙이기 쉽다.
export async function withdrawAccount(userId: string): Promise<void> {
  const pool = getPool();

  // 본인이 리더/멤버로 있는 크루는 이미 만들어둔 "크루 나가기" 로직을 그대로 재사용한다 —
  // 마지막 멤버면 크루가 삭제되고, 아니면 LEFT 처리만 되는 동작이 회원 탈퇴라고 다를 이유가 없다.
  const { rows: myCrews } = await pool.query(
    `SELECT crew_id FROM crew.crew_members WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId]
  );
  for (const row of myCrews) {
    await leaveCrew(row.crew_id, userId);
  }

  // 계정 자체는 지우지 않으므로(하드 삭제가 아니므로), 진행 중인 세션은 명시적으로 회수해야 한다.
  await pool.query(
    `UPDATE auth_user.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );

  await pool.query(
    `UPDATE auth_user.users SET status = 'WITHDRAWN', deleted_at = now(), updated_at = now() WHERE user_id = $1`,
    [userId]
  );
}
