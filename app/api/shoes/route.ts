import {
  NextRequest,
  NextResponse
} from 'next/server';

import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { searchShoeCatalog } from '@/lib/shoes';
import {
  searchShoeCatalogElasticsearch
} from '@/lib/shoeSearch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PAGE_SIZE = 24;

export async function GET(
  request: NextRequest
) {
  const session =
    await getServerSession(authOptions);

  const { searchParams } = request.nextUrl;

  const offset = Math.max(
    0,
    Number(searchParams.get('offset') ?? '0') || 0
  );

  const carbonPlateParam =
    searchParams.get('carbonPlate');

  const filter = {
    q: searchParams.get('q'),
    brand: searchParams.get('brand'),
    purpose: searchParams.get('purpose'),
    recommendLevel:
      searchParams.get('recommendLevel'),
    footWidth: searchParams.get('footWidth'),
    carbonPlate:
      carbonPlateParam === 'true'
        ? true
        : carbonPlateParam === 'false'
          ? false
          : null,
    priceMin: searchParams.get('priceMin')
      ? Number(searchParams.get('priceMin'))
      : null,
    priceMax: searchParams.get('priceMax')
      ? Number(searchParams.get('priceMax'))
      : null,
    sort:
      (searchParams.get('sort') as
        | 'popular'
        | 'price_asc'
        | 'price_desc'
        | 'score'
        | null) ?? 'popular',
    limit: PAGE_SIZE,
    offset
  };

  // 검증 전에는 PostgreSQL이 기본값이다.
  const useElasticsearch =
    searchParams.get('engine') ===
    'elasticsearch';

  const searchFunction = useElasticsearch
    ? searchShoeCatalogElasticsearch
    : searchShoeCatalog;

  const { shoes, total } =
    await searchFunction(
      filter,
      session?.user?.id ?? null
    );

  return NextResponse.json({
    engine: useElasticsearch
      ? 'elasticsearch'
      : 'postgres',
    shoes,
    total,
    hasMore: offset + shoes.length < total
  });
}
