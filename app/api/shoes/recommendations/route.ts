import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRecommendedShoes } from '@/lib/shoes';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const shoes = await getRecommendedShoes(session?.user?.id ?? null);
  return NextResponse.json({ shoes });
}
