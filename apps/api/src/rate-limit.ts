export type ClientIpSource = {
  remoteAddress: string | null;
  forwardedFor: string | null;
  realIp: string | null;
};

/**
 * Socket address by default. Forwarded headers count only when a reverse
 * proxy is explicitly trusted, so a client cannot pick their own bucket.
 * With trust enabled, the first X-Forwarded-For hop wins, then X-Real-IP.
 */
export function resolveClientIp(source: ClientIpSource, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = firstForwardedAddress(source.forwardedFor);
    if (forwarded) return forwarded;
    const realIp = source.realIp?.trim();
    if (realIp) return realIp;
  }
  const remote = source.remoteAddress?.trim();
  return remote ? remote : "unknown";
}

export type RateLimiter = {
  check: (key: string) => { allowed: true } | { allowed: false; retryAfterSeconds: number };
};

export function createFixedWindowRateLimiter(options: {
  max: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const now = options.now ?? Date.now;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key) {
      const time = now();
      const existing = buckets.get(key);
      if (!existing || time >= existing.resetAt) {
        buckets.set(key, { count: 1, resetAt: time + options.windowMs });
        return { allowed: true };
      }
      if (existing.count >= options.max) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - time) / 1000)),
        };
      }
      existing.count += 1;
      return { allowed: true };
    },
  };
}

function firstForwardedAddress(header: string | null): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim();
  return first ? first : null;
}
