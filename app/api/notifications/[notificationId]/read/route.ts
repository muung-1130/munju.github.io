import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { markNotificationRead } from '@/lib/notifications';

export async function POST(request: Request, { params }: { params: { notificationId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const ok = await markNotificationRead(params.notificationId, session.user.id);
  if (!ok) {
    return NextResponse.json({ error: '알림을 찾을 수 없어요.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
