import { NextRequest, NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/geocode';

export const dynamic = 'force-dynamic';

// 로그인 사용자의 auth_user.users.dong(예: "서울특별시 종로구 종로3가") 주소 문자열을
// 좌표로 변환한다 — 위치 정보 접근이 안 될 때 지도 중심점 폴백으로 쓰인다.
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address) return NextResponse.json({ error: 'address가 필요해요.' }, { status: 400 });
  const point = await geocodeAddress(address);
  if (!point) return NextResponse.json({ error: '주소를 찾지 못했어요.' }, { status: 404 });
  return NextResponse.json(point);
}
