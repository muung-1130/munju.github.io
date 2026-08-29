import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMyCrewForBattle } from '@/lib/crew';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ crewId: null });
  }
  const crew = await getMyCrewForBattle(session.user.id);
  return NextResponse.json(crew ?? { crewId: null });
}
