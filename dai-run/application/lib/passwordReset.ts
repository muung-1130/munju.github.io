import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db';
import { sendMail } from '@/lib/mailer';

const CODE_TTL_MINUTES = 10;

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// 아이디 찾기: 이메일로 아이디를 보내준다. (요청에 따라) 회원정보에 없는 이메일이면 보내지 않고
// false를 반환해 호출부가 "가입된 계정이 없다"고 명확히 알려줄 수 있게 한다.
export async function sendUsernameByEmail(email: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query('SELECT user_name FROM auth_user.users WHERE user_email = $1 AND deleted_at IS NULL', [
    email
  ]);
  if (rows.length === 0) return false;
  await sendMail({
    to: email,
    subject: '[DAI RUN] 아이디 찾기 결과',
    text: `안녕하세요, DAI RUN입니다.\n\n요청하신 계정의 아이디는 "${rows[0].user_name}" 입니다.\n\n본인이 요청하지 않았다면 이 메일을 무시해주세요.`
  });
  return true;
}

// 비밀번호 재설정 코드 발급: username+email이 모두 일치하는 계정에만 코드를 보낸다. 일치하는
// 계정이 없으면 false를 반환해 호출부가 명확한 안내를 줄 수 있게 한다.
export async function requestPasswordResetCode(username: string, email: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT user_id FROM auth_user.users WHERE user_name = $1 AND user_email = $2 AND deleted_at IS NULL',
    [username, email]
  );
  if (rows.length === 0) return false;
  const userId = rows[0].user_id;

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  await pool.query(
    'INSERT INTO auth_user.password_reset_codes (user_id, code_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, codeHash, expiresAt]
  );

  await sendMail({
    to: email,
    subject: '[DAI RUN] 비밀번호 재설정 인증코드',
    text: `안녕하세요, DAI RUN입니다.\n\n비밀번호 재설정 인증코드는 "${code}" 입니다. ${CODE_TTL_MINUTES}분 안에 입력해주세요.\n\n본인이 요청하지 않았다면 이 메일을 무시해주세요.`
  });
  return true;
}

export type ConfirmResult = 'ok' | 'invalid' | 'expired';

export async function confirmPasswordReset(
  username: string,
  email: string,
  code: string,
  newPasswordHash: string
): Promise<ConfirmResult> {
  const pool = getPool();
  const { rows: userRows } = await pool.query(
    'SELECT user_id FROM auth_user.users WHERE user_name = $1 AND user_email = $2 AND deleted_at IS NULL',
    [username, email]
  );
  if (userRows.length === 0) return 'invalid';
  const userId = userRows[0].user_id;

  const { rows: codeRows } = await pool.query(
    `SELECT code_id, code_hash, expires_at FROM auth_user.password_reset_codes
      WHERE user_id = $1 AND used_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (codeRows.length === 0) return 'invalid';
  const codeRow = codeRows[0];

  if (new Date(codeRow.expires_at).getTime() < Date.now()) return 'expired';

  const matches = await bcrypt.compare(code, codeRow.code_hash);
  if (!matches) return 'invalid';

  await pool.query('UPDATE auth_user.password_reset_codes SET used_at = now() WHERE code_id = $1', [codeRow.code_id]);
  await pool.query('UPDATE auth_user.users SET user_password = $1, updated_at = now() WHERE user_id = $2', [
    newPasswordHash,
    userId
  ]);
  return 'ok';
}
