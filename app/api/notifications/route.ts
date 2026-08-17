import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUnreadNotifications } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ notifications: [] });
  }
  const notifications = await getUnreadNotifications(session.user.id);
  return NextResponse.json({ notifications });
}
