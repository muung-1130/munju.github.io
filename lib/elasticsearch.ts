import 'server-only';

import { Client } from '@elastic/elasticsearch';

const node = process.env.ELASTICSEARCH_URL;
const username = process.env.ELASTICSEARCH_USERNAME;
const password = process.env.ELASTICSEARCH_PASSWORD;

if (!node || !username || !password) {
  throw new Error(
    'Elasticsearch 연결 설정이 없습니다.'
  );
}

export const elasticsearch = new Client({
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

export const ELASTICSEARCH_INDICES = {
  marathons: 'marathons',
  courses: 'courses',
  runningShoes: 'running_shoes'
} as const;
