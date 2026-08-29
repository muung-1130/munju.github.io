import { elasticsearch } from '@/lib/elasticsearch';

export async function searchCourseIdsElasticsearch(
  query: string
): Promise<string[]> {
  const response = await elasticsearch.search({
    index: 'courses',
    size: 1000,

    _source: [
      'courseId'
    ],

    query: {
      bool: {
        must: [
          {
            bool: {
              should: [
                {
                  multi_match: {
                    query,
                    fields: [
                      'name^4',
                      'description^2'
                    ]
                  }
                },
                {
                  wildcard: {
                    region: {
                      value: `*${query}*`
                    }
                  }
                }
              ],
              minimum_should_match: 1
            }
          }
        ],

        filter: [
          {
            term: {
              visibility: 'PUBLIC'
            }
          },
          {
            term: {
              status: 'ACTIVE'
            }
          }
        ]
      }
    }
  });

  return response.hits.hits
    .map((hit) => {
      const source = hit._source as
        | {
            courseId?: string;
          }
        | undefined;

      return source?.courseId;
    })
    .filter(
      (courseId): courseId is string =>
        Boolean(courseId)
    );
}
