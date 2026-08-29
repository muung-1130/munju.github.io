
import { Client } from '@elastic/elasticsearch';

let cachedClient: Client | null = null;

function createElasticsearchClient() {
  const node = process.env.ELASTICSEARCH_URL;
  const username = process.env.ELASTICSEARCH_USERNAME;
  const password = process.env.ELASTICSEARCH_PASSWORD;

  if (!node || !username || !password) {
    throw new Error('Elasticsearch 연결 설정이 없습니다.');
  }

  return new Client({
    node,

    auth: {
      username,
      password
    },

    tls: {
      rejectUnauthorized: false
    },

    requestTimeout: 10_000,
    maxRetries: 3
  });
}

export function getElasticsearchClient() {
  if (!cachedClient) {
    cachedClient = createElasticsearchClient();
  }

  return cachedClient;
}

export const elasticsearch = new Proxy({} as Client, {
  get(_target, prop) {
    const client = getElasticsearchClient();
    const value = Reflect.get(client, prop, client);

    if (typeof value === 'function') {
      return value.bind(client);
    }

    return value;
  }
});

export const ELASTICSEARCH_INDICES = {
  marathons: 'marathons',
  courses: 'courses',
  runningShoes: 'running_shoes'
} as const;
