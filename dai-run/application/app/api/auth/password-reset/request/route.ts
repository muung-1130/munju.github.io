import { NextRequest, NextResponse } from 'next/server';
import { validateEmail, validateUsername } from '@/lib/validators';
import { requestPasswordResetCode } from '@/lib/passwordReset';
import { isMailConfigured } from '@/lib/mailer';

export async function POST(request: NextRequest) {
  if (!isMailConfigured()) {
    return NextResponse.json({ error: '이메일 발송이 아직 설정되지 않았어요. 관리자에게 문의해주세요.' }, { status: 503 });
  }
  const { username, email } = await request.json();
  if (typeof username !== 'string' || validateUsername(username).length > 0) {
    return NextResponse.json({ error: '아이디를 확인해주세요.' }, { status: 400 });
  }
  if (typeof email !== 'string' || !validateEmail(email)) {
    return NextResponse.json({ error: '올바른 이메일을 입력해주세요.' }, { status: 400 });
  }

  try {
    const found = await requestPasswordResetCode(username, email);
    if (!found) {
      return NextResponse.json({ error: '회원정보에 없는 아이디/이메일이에요.' }, { status: 404 });
    }
  } catch (err) {
    console.error('requestPasswordResetCode 실패:', err);
    return NextResponse.json({ error: '메일 발송에 실패했어요. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
