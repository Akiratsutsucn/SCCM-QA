/**
 * 进程内固定窗口限流。按 IP 只用于防刷，不用于合并统计身份。
 * 单实例部署够用；多实例需换共享存储。
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 50000;

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > MAX_BUCKETS) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

export function resetRateLimits() {
  buckets.clear();
}
