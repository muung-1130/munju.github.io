import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRunningStatsByPeriod, type StatPeriod } from '@/lib/runningRecord';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const periodParam = request.nextUrl.searchParams.get('period');
  const period: StatPeriod = periodParam === 'year' || periodParam === 'month' ? periodParam : 'week';
  const stats = await getRunningStatsByPeriod(session.user.id, period);
  return NextResponse.json(stats);
}
