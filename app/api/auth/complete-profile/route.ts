import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { validateNickname } from '@/lib/validators';
import { resolveUniqueField } from '@/lib/uniqueField';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, errors: ['로그인이 필요해요.'] }, { status: 401 });
  }

  const body = await request.json();
  const gender: string = body.gender ?? '';
  const birthYear: number = Number(body.birthYear);
  const dong: string = (body.dong ?? '').trim();
  const nickname: string = (body.nickname ?? '').trim();

  const errors: string[] = [...validateNickname(nickname)];
  if (gender !== 'M' && gender !== 'F') errors.push('성별을 선택해주세요.');
  if (!Number.isInteger(birthYear) || birthYear < 1930 || birthYear > new Date().getFullYear()) errors.push('출생년도를 선택해주세요.');
  if (!dong) errors.push('동 정보를 선택해주세요.');
  if (!nickname) errors.push('닉네임을 입력해주세요.');

  if (errors.length > 0) {
    return NextResponse.json({ success: false, errors }, { status: 400 });
  }

  try {
    const pool = getPool();
    const userId = session.user.id;

    let finalNickname = nickname;
    if (nickname !== session.user.name) {
<<<<<<< HEAD
      const taken = await pool.query('SELECT 1 FROM auth_user.users WHERE nickname = $1 AND user_id <> $2', [
        nickname,
        userId
      ]);
=======
      const taken = await pool.query('SELECT 1 FROM "user" WHERE nickname = $1 AND user_id <> $2', [nickname, userId]);
>>>>>>> origin/main
      if (taken.rows.length > 0) {
        finalNickname = await resolveUniqueField(pool, 'nickname', nickname, nickname);
      }
    }

    await pool.query(
<<<<<<< HEAD
      `UPDATE auth_user.users SET gender = $1, birth_year = $2, dong = $3, nickname = $4, updated_at = now() WHERE user_id = $5`,
=======
      `UPDATE "user" SET gender = $1, birth_year = $2, dong = $3, nickname = $4, updated_at = now() WHERE user_id = $5`,
>>>>>>> origin/main
      [gender, birthYear, dong, finalNickname, userId]
    );

    return NextResponse.json({ success: true, nickname: finalNickname });
  } catch {
    return NextResponse.json({ success: false, errors: ['DB에 연결할 수 없어요. 잠시 후 다시 시도해주세요.'] }, { status: 503 });
  }
}
