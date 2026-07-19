import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/validators';
import { confirmPasswordReset } from '@/lib/passwordReset';

export async function POST(request: NextRequest) {
  const { username, email, code, newPassword } = await request.json();

  if (typeof username !== 'string' || typeof email !== 'string' || typeof code !== 'string') {
    return NextResponse.json({ error: '입력값을 확인해주세요.' }, { status: 400 });
  }
  const passwordErrors = typeof newPassword === 'string' ? validatePassword(newPassword) : ['비밀번호를 입력해주세요.'];
  if (passwordErrors.length > 0) {
    return NextResponse.json({ error: passwordErrors.join(' ') }, { status: 400 });
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  const result = await confirmPasswordReset(username, email, code.trim(), newPasswordHash);

  if (result === 'expired') {
    return NextResponse.json({ error: '인증코드가 만료됐어요. 다시 요청해주세요.' }, { status: 400 });
  }
  if (result === 'invalid') {
    return NextResponse.json({ error: '인증코드가 올바르지 않아요.' }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
