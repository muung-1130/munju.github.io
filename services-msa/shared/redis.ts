import { createClient, type RedisClientType } from 'redis';

// Redis는 캐시 전용이다 — 여기서 연결이 안 되거나 끊겨도 서비스가 죽으면 안 되고, 호출부가
// DB로 폴백해야 한다(redis-usage-guide-for-developers 참고). REDIS_HOST가 없으면(로컬 개발처럼
// Redis가 아예 없는 환경) 연결을 시도하지 않고 항상 null을 돌려준다.
//
// emptyDir 기반 단일 인스턴스라 재시작/장애가 흔하다는 전제로, 연결 실패 시 매 요청마다 다시
// connect를 시도하며 지연을 만들지 않도록 짧은 쿨다운을 둔다.
//
// services-msa의 각 서비스는 독립된 Docker 이미지로 빌드되므로(각자 Dockerfile/context 보유),
// 이 파일은 서비스별로 복사하지 않고 여기 한 곳에만 두고 각 서비스 Dockerfile이 빌드 시점에
// 이미지 안으로 복사해 쓴다 — Redis를 쓰는 서비스가 늘어날 때마다 이 커넥션 관리 로직이
// 서비스 수만큼 복제되는 걸 막기 위함.
const RECONNECT_COOLDOWN_MS = 10_000;

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType | null> | null = null;
let nextRetryAt = 0;

async function connect(): Promise<RedisClientType | null> {
  const c = createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
      connectTimeout: 2000,
      reconnectStrategy: false
    },
    password: process.env.REDIS_PASSWORD
  }) as RedisClientType;

  c.on('error', () => {
    // 연결된 뒤 소켓이 끊기는 경우도 여기로 들어온다 — 다음 호출이 재연결을 시도하게 비워둔다.
    client = null;
    nextRetryAt = Date.now() + RECONNECT_COOLDOWN_MS;
  });

  try {
    await c.connect();
    return c;
  } catch {
    return null;
  }
}

export async function getRedisClient(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_HOST) return null;
  if (client?.isOpen) return client;
  if (Date.now() < nextRetryAt) return null;

  if (!connecting) {
    connecting = connect();
  }

  const c = await connecting;
  connecting = null;

  if (!c) {
    nextRetryAt = Date.now() + RECONNECT_COOLDOWN_MS;
    client = null;
    return null;
  }

  client = c;
  return client;
}
