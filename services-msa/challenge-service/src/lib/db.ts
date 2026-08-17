import { Pool } from 'pg';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      keepAlive: true
    });
    // idle 커넥션에서 네트워크 계층(서비스 메시 등)이 소켓을 끊는 등 에러가 나면 pg.Pool이
    // 'error'를 emit하는데, 리스너가 없으면 Node 프로세스 전체가 uncaught exception으로
    // 죽는다. 로그만 남기고 죽은 커넥션은 풀이 알아서 교체하게 둔다.
    pool.on('error', (err) => {
      console.error('[db] idle client error', err);
    });
  }
  return pool;
}
