import { NextResponse } from 'next/server';
// import { NextRequest } from 'next/server';
// import { reverseGeocodeToDongLabel } from '@/lib/geocode';

export const dynamic = 'force-dynamic';

// ⚠️ 죽은 코드 (2026-08-19): nginx가 이 경로를 course-service로 라우팅해서 실제 배포에서는
// 원래도 도달 불가능했다(CLAUDE.md §3.1). 원본 로직은 nominatim.openstreetmap.org를 부르는
// 외부 리버스 지오코딩이었는데, 폐쇄망 전환으로 못 쓰게 돼
// services-msa/course-service/src/routes/geo.ts의 같은 라우트와 같은 날짜에 비활성화했다.
//
// export async function GET(request: NextRequest) {
//   const lat = Number(request.nextUrl.searchParams.get('lat'));
//   const lng = Number(request.nextUrl.searchParams.get('lng'));
//   if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
//     return NextResponse.json({ error: 'lat, lng가 필요해요.' }, { status: 400 });
//   }
//   const label = await reverseGeocodeToDongLabel(lat, lng);
//   return NextResponse.json({ label });
// }
export async function GET() {
  return NextResponse.json({ error: '이 API는 폐쇄망 전환으로 비활성화됐어요.' }, { status: 410 });
}
