import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { replyToInquiry } from '@/lib/support';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { inquiryId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.userName !== 'admin') {
    return NextResponse.json({ error: '관리자만 답변할 수 있어요.' }, { status: 403 });
  }
  const body = await request.json();
  const reply = typeof body.reply === 'string' ? body.reply.trim() : '';
  if (!reply) {
    return NextResponse.json({ error: '답변 내용을 입력해주세요.' }, { status: 400 });
  }
  const ok = await replyToInquiry(params.inquiryId, reply);
  if (!ok) {
    return NextResponse.json({ error: '문의를 찾을 수 없어요.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
