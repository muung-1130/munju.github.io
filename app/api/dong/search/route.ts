import { NextRequest, NextResponse } from 'next/server';

type JusoItem = {
  siNm: string;
  sggNm: string;
  emdNm: string;
};

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get('keyword')?.trim() ?? '';
  if (keyword.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const confmKey = process.env.JUSO_API_KEY;
  if (!confmKey) {
    return NextResponse.json(
      { results: [], error: '주소 검색 API 키(JUSO_API_KEY)가 설정되지 않았어요. juso.go.kr에서 발급받은 승인키를 .env에 넣어주세요.' },
      { status: 501 }
    );
  }

  const url = new URL('https://www.juso.go.kr/addrlink/addrLinkApi.do');
  url.searchParams.set('confmKey', confmKey);
  url.searchParams.set('currentPage', '1');
  url.searchParams.set('countPerPage', '20');
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('resultType', 'json');

  try {
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();
    const items: JusoItem[] = data?.results?.juso ?? [];

    const seen = new Set<string>();
    const results = items
      .filter((item) => item.emdNm)
      .map((item) => ({ sido: item.siNm, sigungu: item.sggNm, dong: item.emdNm, display: `${item.siNm} ${item.sggNm} ${item.emdNm}` }))
      .filter((item) => {
        if (seen.has(item.display)) return false;
        seen.add(item.display);
        return true;
      });

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [], error: '주소 검색 중 오류가 발생했어요.' }, { status: 502 });
  }
}
