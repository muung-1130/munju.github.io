import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import bcrypt from 'bcryptjs';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { validateEmail, validateNickname, validatePassword, validateUsername } from '@/lib/validators';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT user_name, user_email, nickname, real_name, gender, birth_year, dong, (user_password IS NOT NULL) AS has_password
       FROM auth_user.users WHERE user_id = $1 AND deleted_at IS NULL`,
    [session.user.id]
  );
  const row = rows[0];
  if (!row) return NextResponse.json({ error: '사용자를 찾을 수 없어요.' }, { status: 404 });
  return NextResponse.json({
    username: row.user_name,
    email: row.user_email,
    nickname: row.nickname,
    name: row.real_name,
    gender: row.gender,
    birthYear: row.birth_year,
    dong: row.dong,
    hasPassword: row.has_password
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const userId = session.user.id;
  const body = await request.json();
  const { username, email, nickname, name, gender, birthYear, dong, currentPassword, newPassword } = body ?? {};

  const errors: string[] = [];
  if (typeof username !== 'string' || username.trim().length === 0) errors.push('아이디를 입력해주세요.');
  else errors.push(...validateUsername(username));
  if (typeof email !== 'string' || !validateEmail(email)) errors.push('올바른 이메일을 입력해주세요.');
  if (typeof nickname !== 'string' || nickname.trim().length === 0) errors.push('닉네임을 입력해주세요.');
  else errors.push(...validateNickname(nickname));
  if (typeof name !== 'string' || name.trim().length === 0) errors.push('이름을 입력해주세요.');
  if (gender !== 'M' && gender !== 'F') errors.push('성별을 선택해주세요.');
  if (!Number.isInteger(Number(birthYear)) || Number(birthYear) < 1930 || Number(birthYear) > new Date().getFullYear()) {
    errors.push('출생년도를 선택해주세요.');
  }
  if (typeof dong !== 'string' || dong.trim().length === 0) errors.push('동 정보를 선택해주세요.');

  if (errors.length > 0) {
    return NextResponse.json({ success: false, errors }, { status: 400 });
  }

  const pool = getPool();

  const { rows: currentRows } = await pool.query(
    `SELECT user_name, nickname, user_password FROM auth_user.users WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  const currentRow = currentRows[0];
  if (!currentRow) {
    return NextResponse.json({ success: false, errors: ['사용자를 찾을 수 없어요.'] }, { status: 404 });
  }

  if (username !== currentRow.user_name) {
    const taken = await pool.query('SELECT 1 FROM auth_user.users WHERE user_name = $1 AND user_id <> $2', [username, userId]);
    if (taken.rows.length > 0) {
      return NextResponse.json({ success: false, errors: ['이미 사용 중인 아이디예요.'] }, { status: 409 });
    }
  }
  if (nickname !== currentRow.nickname) {
    const taken = await pool.query('SELECT 1 FROM auth_user.users WHERE nickname = $1 AND user_id <> $2', [nickname, userId]);
    if (taken.rows.length > 0) {
      return NextResponse.json({ success: false, errors: ['이미 사용 중인 닉네임이에요.'] }, { status: 409 });
    }
  }

  let newPasswordHash: string | null = null;
  if (typeof newPassword === 'string' && newPassword.length > 0) {
    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      return NextResponse.json({ success: false, errors: passwordErrors }, { status: 400 });
    }
    // 이미 비밀번호가 설정돼 있으면(자격증명 로그인 계정) 현재 비밀번호 확인이 필요하다.
    // 구글 전용 계정이라 비밀번호가 없다면 새로 설정하는 것이므로 확인 없이 허용한다.
    if (currentRow.user_password) {
      if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
        return NextResponse.json({ success: false, errors: ['현재 비밀번호를 입력해주세요.'] }, { status: 400 });
      }
      const valid = await bcrypt.compare(currentPassword, currentRow.user_password);
      if (!valid) {
        return NextResponse.json({ success: false, errors: ['현재 비밀번호가 올바르지 않아요.'] }, { status: 400 });
      }
    }
    newPasswordHash = await bcrypt.hash(newPassword, 10);
  }

  await pool.query(
    `UPDATE auth_user.users
        SET user_name = $1, user_email = $2, nickname = $3, real_name = $4, gender = $5, birth_year = $6, dong = $7,
            user_password = COALESCE($8, user_password), updated_at = now()
      WHERE user_id = $9`,
    [username, email, nickname, name, gender, Number(birthYear), dong, newPasswordHash, userId]
  );

  return NextResponse.json({ success: true, nickname });
}
