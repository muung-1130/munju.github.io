import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createInquiry, getInquiryList } from '@/lib/support';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const inquiries = await getInquiryList();
  return NextResponse.json({ inquiries });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const body = await request.json();
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!title || title.length > 200) {
    return NextResponse.json({ error: '제목을 200자 이내로 입력해주세요.' }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: '문의 내용을 입력해주세요.' }, { status: 400 });
  }
  const inquiryId = await createInquiry(session.user.id, title, content);
  return NextResponse.json({ success: true, inquiryId });
}
