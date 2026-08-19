import { getRedisClient } from '../../../shared/redis.js';

// 프로세스 메모리 기반 슬라이딩 윈도 fallback. Redis를 못 쓸 때(로컬 개발, Redis 장애)만 쓰인다.
// 인스턴스가 여러 개면 이 카운터는 인스턴스별로 따로 논다는 한계가 있지만, Redis 장애 중에도
// 마라톤 신청처럼 순간적으로 몰리는 엔드포인트에 대한 최소한의 방어선은 유지해야 한다.
const buckets = new Map<string, number[]>();

// 오래된 키가 무한히 쌓이는 걸 막기 위한 주기적 청소.
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60_000;

function checkRateLimitInMemory(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    for (const [k, timestamps] of Array.from(buckets.entries())) {
      if (timestamps.every((t: number) => now - t > windowMs)) buckets.delete(k);
    }
    lastCleanup = now;
  }

  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) {
    const retryAfterMs = windowMs - (now - timestamps[0]);
    buckets.set(key, timestamps);
    return { allowed: false, retryAfterMs };
  }
  timestamps.push(now);
  buckets.set(key, timestamps);
  return { allowed: true, retryAfterMs: 0 };
}

// Redis INCR + PEXPIRE 기반 rate limit(redis-usage-guide §9). 여러 인스턴스가 카운터를 공유하므로
// 수평 확장해도 정확하게 동작한다 — 인메모리 버전의 "인스턴스별로 따로 논다"는 한계를 없앤다.
// Redis 호출이 실패하면 인메모리 fallback으로 내려간다: rate limit은 서비스를 죽여도 되는
// 기능이 아니라, Redis 장애 중에도 신청 자체는 막히면 안 된다.
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const redis = await getRedisClient();
  if (!redis) return checkRateLimitInMemory(key, limit, windowMs);

  const redisKey = `marathon:ratelimit:${key}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pExpire(redisKey, windowMs);
    }
    if (count <= limit) return { allowed: true, retryAfterMs: 0 };

    const ttl = await redis.pTTL(redisKey);
    return { allowed: false, retryAfterMs: ttl > 0 ? ttl : windowMs };
  } catch (err) {
    console.error('[rateLimit] redis incr failed, falling back to in-memory limiter', err);
    return checkRateLimitInMemory(key, limit, windowMs);
  }
}
