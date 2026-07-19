import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getChallengeDetail } from '@/lib/challenges';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { challengeId: string } }) {
  const session = await getServerSession(authOptions);
  const detail = await getChallengeDetail(params.challengeId, session?.user?.id ?? null);
  if (!detail) {
    return NextResponse.json({ error: '챌린지를 찾을 수 없어요.' }, { status: 404 });
  }
  return NextResponse.json({ challenge: detail });
}
