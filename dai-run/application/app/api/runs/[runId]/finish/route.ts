import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { finishRun } from '@/lib/runTracking';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { runId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const body = await request.json();

  const status = body.status === 'STOPPED' ? 'STOPPED' : body.status === 'COMPLETED' ? 'COMPLETED' : null;
  const sourceType = body.sourceType === 'MANUAL' ? 'MANUAL' : 'APP';
  const distanceM = Number(body.distanceM);
  const durationSec = Number(body.durationSec);
  const movingDurationSec = Number(body.movingDurationSec ?? body.durationSec);
  const avgPaceSecPerKm =
    body.avgPaceSecPerKm === null || body.avgPaceSecPerKm === undefined ? null : Math.round(Number(body.avgPaceSecPerKm));
  const bestPaceSecPerKm =
    body.bestPaceSecPerKm === null || body.bestPaceSecPerKm === undefined ? null : Math.round(Number(body.bestPaceSecPerKm));
  const routePositions: [number, number][] = Array.isArray(body.routePositions)
    ? body.routePositions.filter((p: unknown) => Array.isArray(p) && p.length === 2)
    : [];
  const myShoeId = typeof body.myShoeId === 'string' && body.myShoeId.trim() ? body.myShoeId : null;

  if (!status || !Number.isFinite(distanceM) || distanceM < 0 || !Number.isFinite(durationSec) || durationSec < 0) {
    return NextResponse.json({ error: '기록 정보가 올바르지 않아요.' }, { status: 400 });
  }

  try {
    await finishRun(params.runId, session.user.id, {
      status,
      sourceType,
      distanceM: Math.round(distanceM),
      durationSec: Math.round(durationSec),
      movingDurationSec: Math.round(movingDurationSec),
      avgPaceSecPerKm,
      bestPaceSecPerKm,
      routePositions,
      myShoeId
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '기록 저장에 실패했어요.' }, { status: 400 });
  }
}
