import type { estypes } from '@elastic/elasticsearch';

import { elasticsearch } from '@/lib/elasticsearch';

import type {
  DistanceBucket,
  MarathonListFilter,
  MarathonRace
} from '@/lib/marathon';

const PAGE_SIZE = 20;

function todayKst(): string {
  return new Date().toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Seoul'
  });
}

function getDistanceRange(
  bucket: DistanceBucket
): estypes.QueryDslNumberRangeQuery {
  switch (bucket) {
    case 'KM5':
      return {
        lte: 5
      };

    case 'KM10':
      return {
        gt: 5,
        lte: 10
      };

    case 'KM15':
      return {
        gt: 10,
        lt: 20
      };

    case 'HALF':
      return {
        gte: 20,
        lte: 30
      };

    case 'FULL':
      return {
        gt: 30
      };
  }
}

export async function searchMarathonRacesElasticsearch(
  filter: MarathonListFilter
): Promise<{
  races: MarathonRace[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const must: estypes.QueryDslQueryContainer[] = [];
  const filters: estypes.QueryDslQueryContainer[] = [];

  const keyword = filter.keyword?.trim();

  if (keyword) {
    must.push({
      bool: {
        should: [
          {
            match: {
              raceName: {
                query: keyword
              }
            }
          },
          {
            wildcard: {
              region: {
                value: `*${keyword}*`
              }
            }
          }
        ],
        minimum_should_match: 1
      }
    });
  }

  if (filter.region?.trim()) {
    filters.push({
      term: {
        region: filter.region.trim()
      }
    });
  }

  const today = todayKst();

  // 지난 대회를 포함하지 않는 경우:
  // 대회일이 오늘 이후이거나 날짜가 없는 문서만 조회
  if (!filter.includePast) {
    filters.push({
      bool: {
        should: [
          {
            range: {
              raceDate: {
                gte: today
              }
            }
          },
          {
            bool: {
              must_not: [
                {
                  exists: {
                    field: 'raceDate'
                  }
                }
              ]
            }
          }
        ],
        minimum_should_match: 1
      }
    });
  }

  // 접수 마감 대회를 포함하지 않는 경우:
  // 접수 종료일이 오늘 이후이거나 종료일이 없는 문서만 조회
  if (!filter.includeClosed) {
    filters.push({
      bool: {
        should: [
          {
            range: {
              registrationEndDate: {
                gte: today
              }
            }
          },
          {
            bool: {
              must_not: [
                {
                  exists: {
                    field: 'registrationEndDate'
                  }
                }
              ]
            }
          }
        ],
        minimum_should_match: 1
      }
    });
  }

  if (filter.distanceBucket) {
    filters.push({
      range: {
        distanceKm: getDistanceRange(
          filter.distanceBucket
        )
      }
    });
  }

  if (filter.dateFrom || filter.dateTo) {
    filters.push({
      range: {
        raceDate: {
          ...(filter.dateFrom
            ? { gte: filter.dateFrom }
            : {}),
          ...(filter.dateTo
            ? { lte: filter.dateTo }
            : {})
        }
      }
    });
  }

  const page = Math.max(1, filter.page);

  const response =
    await elasticsearch.search<MarathonRace>({
      index: 'marathons',
      from: (page - 1) * PAGE_SIZE,
      size: PAGE_SIZE,
      track_total_hits: true,

      query: {
        bool: {
          must:
            must.length > 0
              ? must
              : [{ match_all: {} }],
          filter: filters
        }
      },

      sort: [
        {
          raceDate: {
            order: 'asc',
            missing: '_last'
          }
        },
        {
          raceId: {
            order: 'asc'
          }
        }
      ]
    });

  const races = response.hits.hits
    .map((hit) => hit._source)
    .filter(
      (race): race is MarathonRace =>
        race !== undefined
    );

  const total =
    typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value ?? 0;

  return {
    races,
    total,
    page,
    pageSize: PAGE_SIZE
  };
}
