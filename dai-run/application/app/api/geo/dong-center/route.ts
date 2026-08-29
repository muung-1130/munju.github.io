import { NextResponse } from 'next/server';
// import { NextRequest } from 'next/server';
// import { geocodeAddress } from '@/lib/geocode';

export const dynamic = 'force-dynamic';

// ⚠️ 죽은 코드 (2026-08-19): 이 파일은 nginx가 애초에 course-service로 라우팅해서 실제 배포에서는
// 도달 불가능했던 Next.js 경로였다(CLAUDE.md §3.1). 원래 로직은
// services-msa/course-service/src/routes/geo.ts의 같은 이름 라우트를 그대로 복제한 것이었는데,
// 그쪽도 폐쇄망 전환으로 외부 지오코딩 API(juso.go.kr/nominatim, lib/geocode.ts)를 쓸 수 없게 돼
// 같은 날짜에 주석 처리했다. 여기서도 동일하게 맞춰둔다. 아래 원래 GET 핸들러 참고.
//
// export async function GET(request: NextRequest) {
//   const address = request.nextUrl.searchParams.get('address');
//   if (!address) return NextResponse.json({ error: 'address가 필요해요.' }, { status: 400 });
//   const point = await geocodeAddress(address);
//   if (!point) return NextResponse.json({ error: '주소를 찾지 못했어요.' }, { status: 404 });
//   return NextResponse.json(point);
// }
export async function GET() {
  return NextResponse.json({ error: '이 API는 폐쇄망 전환으로 비활성화됐어요.' }, { status: 410 });
}
