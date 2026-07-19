import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getInquiryDetail } from '@/lib/support';

export const dynamic = 'force-dynamic';

// 문의 내용은 작성자 본인과 admin 계정만 볼 수 있다. 이 서비스에는 별도 role 컬럼이 없어서
// user_name === 'admin'을 관리자로 취급한다(지금까지 이 계정을 그렇게 써왔음).
export async function GET(_request: NextRequest, { params }: { params: { inquiryId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const inquiry = await getInquiryDetail(params.inquiryId);
  if (!inquiry) {
    return NextResponse.json({ error: '문의를 찾을 수 없어요.' }, { status: 404 });
  }
  const isAdmin = session.user.userName === 'admin';
  const isOwner = inquiry.userId === session.user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: '이 문의를 볼 권한이 없어요.' }, { status: 403 });
  }
  return NextResponse.json({ inquiry, isAdmin });
}
