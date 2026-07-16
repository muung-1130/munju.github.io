import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { validateNickname } from '@/lib/validators';

export async function GET(request: NextRequest) {
  const nickname = request.nextUrl.searchParams.get('nickname')?.trim() ?? '';
  if (nickname.length === 0) {
    return NextResponse.json({ available: true });
  }

  const errors = validateNickname(nickname);
  if (errors.length > 0) {
    return NextResponse.json({ available: false, errors }, { status: 400 });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query('SELECT 1 FROM "user" WHERE nickname = $1', [nickname]);
    return NextResponse.json({ available: rows.length === 0 });
  } catch {
    return NextResponse.json({ available: false, errors: ['DB에 연결할 수 없어요. 잠시 후 다시 시도해주세요.'] }, { status: 503 });
  }
}
