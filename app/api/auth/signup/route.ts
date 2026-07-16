import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db';
import { validateEmail, validateNickname, validatePassword, validateUsername } from '@/lib/validators';
import { resolveUniqueField } from '@/lib/uniqueField';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const username: string = (body.username ?? '').trim();
  const password: string = body.password ?? '';
  const email: string = (body.email ?? '').trim();
  const name: string = (body.name ?? '').trim();
  const gender: string = body.gender ?? '';
  const birthYear: number = Number(body.birthYear);
  const dong: string = (body.dong ?? '').trim();
  const nickname: string = (body.nickname ?? '').trim();

  const errors: string[] = [
    ...validateUsername(username),
    ...validatePassword(password),
    ...validateNickname(nickname)
  ];
  if (!name) errors.push('이름을 입력해주세요.');
  if (!validateEmail(email)) errors.push('올바른 이메일 형식이 아니에요.');
  if (gender !== 'M' && gender !== 'F') errors.push('성별을 선택해주세요.');
  if (!Number.isInteger(birthYear) || birthYear < 1930 || birthYear > new Date().getFullYear()) errors.push('출생년도를 선택해주세요.');
  if (!dong) errors.push('동 정보를 선택해주세요.');

  if (errors.length > 0) {
    return NextResponse.json({ success: false, errors }, { status: 400 });
  }

  try {
    const pool = getPool();

    const usernameTaken = await pool.query('SELECT 1 FROM "user" WHERE user_name = $1', [username]);
    if (usernameTaken.rows.length > 0) {
      return NextResponse.json({ success: false, errors: ['이미 사용 중인 아이디예요.'] }, { status: 409 });
    }
    const emailTaken = await pool.query('SELECT 1 FROM "user" WHERE user_email = $1', [email]);
    if (emailTaken.rows.length > 0) {
      return NextResponse.json({ success: false, errors: ['이미 가입된 이메일이에요.'] }, { status: 409 });
    }

    const finalNickname = await resolveUniqueField(pool, 'nickname', nickname, username);
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO "user" (user_name, name, user_email, gender, birth_year, dong, nickname, status, password_hash, auth_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, 'local')`,
      [username, name, email, gender, birthYear, dong, finalNickname, passwordHash]
    );

    return NextResponse.json({ success: true, nickname: finalNickname });
  } catch {
    return NextResponse.json({ success: false, errors: ['DB에 연결할 수 없어요. 잠시 후 다시 시도해주세요.'] }, { status: 503 });
  }
}
