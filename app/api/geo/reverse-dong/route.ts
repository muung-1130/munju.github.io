import { NextRequest, NextResponse } from 'next/server';
import { reverseGeocodeToDongLabel } from '@/lib/geocode';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get('lat'));
  const lng = Number(request.nextUrl.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat, lng가 필요해요.' }, { status: 400 });
  }
  const label = await reverseGeocodeToDongLabel(lat, lng);
  return NextResponse.json({ label });
}
