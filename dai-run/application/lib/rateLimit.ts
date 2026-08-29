// 프로세스 메모리 기반 슬라이딩 윈도 rate limiter. 별도 Redis 없이도 마라톤 신청처럼
// 순간적으로 요청이 몰리는 엔드포인트에서 한 사용자가 짧은 시간에 반복 재시도/스크립트로
// 서버를 두들기는 것을 막는 최소한의 방어선이다.
//
// 주의: 인스턴스가 여러 개로 늘어나면(수평 확장) 이 카운터는 인스턴스별로 따로 논다 —
// 지금은 next-app이 단일 인스턴스로 운영 중이라는 전제에서만 유효하며, 실제로 다중 인스턴스로
// 확장하면 Redis 등 공유 저장소 기반으로 교체해야 한다(CLAUDE.md 12.1 Redis 사용 후보 참고).
const buckets = new Map<string, number[]>();

// 오래된 키가 무한히 쌓이는 걸 막기 위한 주기적 청소.
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60_000;

export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
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
