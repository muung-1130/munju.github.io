import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getWearAnalysisResult } from '@/lib/shoes';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { userShoeId: string; wearAnalysisId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const result = await getWearAnalysisResult(params.wearAnalysisId, params.userShoeId, session.user.id);
  if (!result) {
    return NextResponse.json({ error: '분석 결과를 찾을 수 없어요.' }, { status: 404 });
  }
  return NextResponse.json({ result });
}
