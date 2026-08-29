import { NextRequest, NextResponse } from 'next/server';
import { searchShoeCatalogForPicker } from '@/lib/shoes';

export const dynamic = 'force-dynamic';

// 러닝화 등록/수정 폼의 모델 검색 자동완성.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') ?? '';
  const shoes = await searchShoeCatalogForPicker(query);
  return NextResponse.json({ shoes });
}
