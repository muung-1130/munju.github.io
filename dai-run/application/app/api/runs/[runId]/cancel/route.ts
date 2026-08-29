import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { cancelRun } from '@/lib/runTracking';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, { params }: { params: { runId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  await cancelRun(params.runId, session.user.id);
  return NextResponse.json({ success: true });
}
