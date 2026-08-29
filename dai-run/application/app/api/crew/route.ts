import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCrews, createCrew } from '@/lib/crew';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const crews = await getCrews(session?.user?.id ?? null, session?.user?.dong);
  return NextResponse.json({ crews });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }

  const body = await request.json();
  const crewName = typeof body.crewName === 'string' ? body.crewName.trim() : '';
  if (crewName.length === 0) {
    return NextResponse.json({ error: '크루 이름을 입력해주세요.' }, { status: 400 });
  }
  const joinType = body.joinType === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';
  const maxMembers = Number(body.maxMembers);
  if (!Number.isInteger(maxMembers) || maxMembers <= 0) {
    return NextResponse.json({ error: '최대 인원을 올바르게 입력해주세요.' }, { status: 400 });
  }

  const toIntOrNull = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));
  const targetDistanceMinM = toIntOrNull(body.targetDistanceMinM);
  const targetDistanceMaxM = toIntOrNull(body.targetDistanceMaxM);
  const paceMinSecPerKm = toIntOrNull(body.paceMinSecPerKm);
  const paceMaxSecPerKm = toIntOrNull(body.paceMaxSecPerKm);
  const minimumWeeklyFrequency = toIntOrNull(body.minimumWeeklyFrequency);

  if (targetDistanceMinM !== null && targetDistanceMaxM !== null && targetDistanceMinM > targetDistanceMaxM) {
    return NextResponse.json({ error: '목표 거리 범위를 확인해주세요.' }, { status: 400 });
  }
  if (paceMinSecPerKm !== null && paceMaxSecPerKm !== null && paceMinSecPerKm > paceMaxSecPerKm) {
    return NextResponse.json({ error: '페이스 범위를 확인해주세요.' }, { status: 400 });
  }

  const crewId = await createCrew({
    ownerUserId: session.user.id,
    crewName,
    description: typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : '',
    regionCode: typeof body.regionCode === 'string' && body.regionCode.length > 0 ? body.regionCode : null,
    meetingLocation: typeof body.meetingLocation === 'string' && body.meetingLocation.length > 0 ? body.meetingLocation : null,
    targetDistanceMinM,
    targetDistanceMaxM,
    paceMinSecPerKm,
    paceMaxSecPerKm,
    minimumWeeklyFrequency,
    joinType,
    maxMembers
  });

  return NextResponse.json({ success: true, crewId });
}
