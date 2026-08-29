import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getLatestWearAnalysisResult } from '@/lib/shoes';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { userShoeId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const result = await getLatestWearAnalysisResult(params.userShoeId, session.user.id);
  if (!result) {
    return NextResponse.json({ result: null });
  }
  return NextResponse.json({ result });
}
