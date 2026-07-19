import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllShoesWithStats } from '@/lib/shoes';

export const dynamic = 'force-dynamic';

// 인기순 보기 — 찜(하트) 많은 순으로 카탈로그 전체를 내려준다.
export async function GET() {
  const session = await getServerSession(authOptions);
  const shoes = await getAllShoesWithStats(session?.user?.id ?? null);
  shoes.sort((a, b) => b.likeCount - a.likeCount || b.catalogScore - a.catalogScore);
  return NextResponse.json({ shoes });
}
