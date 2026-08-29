import { Pool } from 'pg';

// 서버 전용 모듈입니다. 클라이언트 컴포넌트에서 절대 import하지 마세요.
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global.__pgPool) {
    global.__pgPool = new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      max: 5,
      connectionTimeoutMillis: 5000
    });
  }
  return global.__pgPool;
}
