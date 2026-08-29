import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { applyToExclusiveMarathon, applyToMarathon, getMarathonRaceById } from '@/lib/marathon';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// 콜라보 대회처럼 트래픽이 몰릴 수 있는 신청은 사용자당 짧은 시간에 반복 재시도하지 못하게
// 막는다 — 정원이 꽉 찬 순간 클라이언트가 자동으로 재시도를 몰아쳐도 서버가 매번 무거운
// 트랜잭션(FOR UPDATE 락)을 타지 않도록 하는 최소한의 방어선.
const APPLY_RATE_LIMIT = 5;
const APPLY_RATE_WINDOW_MS = 60_000;

export async function POST(_request: NextRequest, { params }: { params: { raceId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const raceId = Number(params.raceId);
  if (!Number.isInteger(raceId)) {
    return NextResponse.json({ error: '잘못된 대회예요.' }, { status: 400 });
  }

  const { allowed, retryAfterMs } = checkRateLimit(`marathon-apply:${session.user.id}`, APPLY_RATE_LIMIT, APPLY_RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: `요청이 너무 잦아요. ${Math.ceil(retryAfterMs / 1000)}초 후 다시 시도해 주세요.` },
      { status: 429 }
    );
  }

  const race = await getMarathonRaceById(raceId);
  if (!race) {
    return NextResponse.json({ error: '대회를 찾을 수 없어요.' }, { status: 404 });
  }

  if (race.isExclusiveCollab) {
    const outcome = await applyToExclusiveMarathon(session.user.id, raceId);
    if (outcome.result === 'race-not-found') {
      return NextResponse.json({ error: '대회를 찾을 수 없어요.' }, { status: 404 });
    }
    if (outcome.result === 'window-not-open') {
      return NextResponse.json({ error: '접수 시작 전이거나 이미 마감됐어요.' }, { status: 409 });
    }
    if (outcome.result === 'already-applied') {
      return NextResponse.json({ error: '이미 신청한 대회예요.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, status: outcome.status, queueSequenceNo: outcome.queueSequenceNo });
  }

  const result = await applyToMarathon(session.user.id, raceId);
  if (result === 'race-not-found') {
    return NextResponse.json({ error: '대회를 찾을 수 없어요.' }, { status: 404 });
  }
  if (result === 'not-open') {
    return NextResponse.json({ error: '접수 기간이 아니에요.' }, { status: 409 });
  }
  if (result === 'already-applied') {
    return NextResponse.json({ error: '이미 신청한 대회예요.' }, { status: 409 });
  }
  return NextResponse.json({ success: true, status: 'CONFIRMED', queueSequenceNo: null });
}
