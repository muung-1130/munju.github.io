import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMarathonRaces, getMarathonRegions, getMyReservationsForRaces, type DistanceBucket } from '@/lib/marathon';

export const dynamic = 'force-dynamic';

const VALID_DISTANCE_BUCKETS: DistanceBucket[] = ['KM5', 'KM10', 'KM15', 'HALF', 'FULL'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParam(value: string | null): string | null {
  return value && DATE_RE.test(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const params = request.nextUrl.searchParams;

  const page = Number(params.get('page') ?? '1');
  const distanceBucketParam = params.get('distanceBucket');
  const filter = {
    keyword: params.get('keyword'),
    region: params.get('region'),
    includeClosed: params.get('includeClosed') === 'true',
    includePast: params.get('includePast') === 'true',
    distanceBucket: VALID_DISTANCE_BUCKETS.includes(distanceBucketParam as DistanceBucket)
      ? (distanceBucketParam as DistanceBucket)
      : null,
    dateFrom: parseDateParam(params.get('dateFrom')),
    dateTo: parseDateParam(params.get('dateTo')),
    page: Number.isInteger(page) && page > 0 ? page : 1
  };

  const [{ races, total, pageSize }, regions] = await Promise.all([getMarathonRaces(filter), getMarathonRegions()]);

  let myReservations: Record<number, { status: string; submittedAt: string }> = {};
  if (session?.user?.id) {
    const map = await getMyReservationsForRaces(
      session.user.id,
      races.map((r) => r.raceId)
    );
    myReservations = Object.fromEntries(
      Array.from(map.entries()).map(([raceId, r]) => [raceId, { status: r.status, submittedAt: r.submittedAt }])
    );
  }

  return NextResponse.json({ races, total, page: filter.page, pageSize, regions, myReservations });
}
