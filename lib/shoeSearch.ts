import type { estypes } from '@elastic/elasticsearch';

import { elasticsearch } from '@/lib/elasticsearch';
import { getPool } from '@/lib/db';

import type {
  ShoeCatalogItem,
  ShoeSearchParams
} from '@/lib/shoes';

type RunningShoeDocument = Omit<
  ShoeCatalogItem,
  'likeCount' | 'likedByUser'
>;

export async function searchShoeCatalogElasticsearch(
  params: ShoeSearchParams,
  userId: string | null
): Promise<{
  shoes: ShoeCatalogItem[];
  total: number;
}> {
  const must: estypes.QueryDslQueryContainer[] = [];
  const filters: estypes.QueryDslQueryContainer[] = [];

  const keyword = params.q?.trim();

  if (keyword) {
    must.push({
      multi_match: {
        query: keyword,
        fields: [
          'shoeName^4',
          'brandName^3',
          'category',
          'purpose',
          'recommendLevel',
          'functionCodes'
        ]
      }
    });
  }

  if (params.brand) {
    filters.push({
      term: {
        'brandName.keyword': params.brand
      }
    });
  }

  if (params.purpose) {
    filters.push({
      term: {
        purpose: params.purpose
      }
    });
  }

  if (params.recommendLevel) {
    filters.push({
      term: {
        recommendLevel: params.recommendLevel
      }
    });
  }

  if (
    params.carbonPlate !== null &&
    params.carbonPlate !== undefined
  ) {
    filters.push({
      term: {
        carbonPlate: params.carbonPlate
      }
    });
  }

  if (
    params.priceMin !== null ||
    params.priceMax !== null
  ) {
    filters.push({
      range: {
        price: {
          ...(params.priceMin !== null &&
          params.priceMin !== undefined
            ? { gte: params.priceMin }
            : {}),
          ...(params.priceMax !== null &&
          params.priceMax !== undefined
            ? { lte: params.priceMax }
            : {})
        }
      }
    });
  }

  const response =
    await elasticsearch.search<RunningShoeDocument>({
      index: 'running_shoes',

      // 현재 83건이므로 필터 결과를 가져온 뒤
      // 사용자별 찜 통계와 함께 정렬한다.
      size: 1000,
      track_total_hits: true,

      query: {
        bool: {
          must:
            must.length > 0
              ? must
              : [{ match_all: {} }],
          filter: filters
        }
      }
    });

  const documents = response.hits.hits
    .map((hit) => hit._source)
    .filter(
      (shoe): shoe is RunningShoeDocument =>
        shoe !== undefined
    );

  if (documents.length === 0) {
    return {
      shoes: [],
      total: 0
    };
  }

  const shoeIds = documents.map(
    (shoe) => shoe.shoeId
  );

  const pool = getPool();

  const { rows } = await pool.query(
    `
      SELECT
        ids.shoe_id,
        COUNT(sl.user_id)::integer AS like_count,
        COALESCE(
          BOOL_OR(sl.user_id = $1),
          false
        ) AS liked_by_user
      FROM unnest($2::bigint[]) AS ids(shoe_id)
      LEFT JOIN shoe.shoe_likes sl
        ON sl.shoe_id = ids.shoe_id
      GROUP BY ids.shoe_id
    `,
    [userId, shoeIds]
  );

  const stats = new Map<
    number,
    {
      likeCount: number;
      likedByUser: boolean;
    }
  >();

  for (const row of rows) {
    stats.set(Number(row.shoe_id), {
      likeCount: Number(row.like_count),
      likedByUser: Boolean(row.liked_by_user)
    });
  }

  const shoes: ShoeCatalogItem[] =
    documents.map((shoe) => {
      const stat = stats.get(shoe.shoeId);

      return {
        ...shoe,
        likeCount: stat?.likeCount ?? 0,
        likedByUser:
          stat?.likedByUser ?? false
      };
    });

  switch (params.sort ?? 'popular') {
    case 'price_asc':
      shoes.sort((a, b) => {
        if (a.price === null) return 1;
        if (b.price === null) return -1;

        return a.price - b.price;
      });
      break;

    case 'price_desc':
      shoes.sort((a, b) => {
        if (a.price === null) return 1;
        if (b.price === null) return -1;

        return b.price - a.price;
      });
      break;

    case 'score':
      shoes.sort(
        (a, b) =>
          b.catalogScore - a.catalogScore
      );
      break;

    case 'popular':
    default:
      shoes.sort(
        (a, b) =>
          b.likeCount - a.likeCount ||
          b.catalogScore - a.catalogScore
      );
  }

  const total =
    typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value ??
        documents.length;

  return {
    shoes: shoes.slice(
      params.offset,
      params.offset + params.limit
    ),
    total
  };
}
