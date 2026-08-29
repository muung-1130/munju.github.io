import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { saveRunSamples, type RunSampleInput } from '@/lib/runTracking';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { runId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const body = await request.json();
  const rawSamples = Array.isArray(body.samples) ? body.samples : [];
  const samples: RunSampleInput[] = rawSamples
    .filter((s: unknown): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s: Record<string, unknown>) => ({
      lat: Number(s.lat),
      lng: Number(s.lng),
      recordedAt: typeof s.recordedAt === 'string' ? s.recordedAt : new Date().toISOString(),
      paceSecPerKm: s.paceSecPerKm === null || s.paceSecPerKm === undefined ? null : Number(s.paceSecPerKm),
      accuracyM: s.accuracyM === null || s.accuracyM === undefined ? null : Number(s.accuracyM),
      speedMps: s.speedMps === null || s.speedMps === undefined ? null : Number(s.speedMps)
    }))
    .filter((s: RunSampleInput) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

  try {
    await saveRunSamples(params.runId, session.user.id, samples);
    return NextResponse.json({ success: true, saved: samples.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '샘플 저장에 실패했어요.' }, { status: 400 });
  }
}
