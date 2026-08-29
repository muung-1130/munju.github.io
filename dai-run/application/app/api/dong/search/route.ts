import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

// 주의(CLAUDE.md §3.1): nginx는 /api/dong/search를 course-service로 라우팅하므로 이 Route
// Handler는 실제 배포에서는 도달 불가능한 죽은 코드다. 실제 서비스 대상 구현은
// services-msa/course-service/src/routes/geo.ts에 있다. 여기는 `next dev`로 로컬 단독 실행할
// 때도 juso.go.kr(외부 API)를 호출하지 않도록 동일한 로컬 DB 조회로 맞춰만 둔다.
export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get('keyword')?.trim() ?? '';
  if (keyword.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const escapedKeyword = keyword.replace(/[\\%_]/g, (ch) => `\\${ch}`);

  try {
    const { rows } = await getPool().query(
      `SELECT sido, sigungu, dong, full_name AS display
       FROM course.legal_dong_codes
       WHERE is_active = true AND dong IS NOT NULL AND full_name ILIKE '%' || $1 || '%' ESCAPE '\\'
       ORDER BY length(full_name), full_name
       LIMIT 20`,
      [escapedKeyword]
    );

    return NextResponse.json({ results: rows });
  } catch {
    return NextResponse.json({ results: [], error: '주소 검색 중 오류가 발생했어요.' }, { status: 502 });
  }
}
