export type RateLimiterConfig = {
  maxRequests: number;
  windowMs: number;
};

export type RateLimiterResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
};

export class SlidingWindowRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxClients = 10_000;
  private readonly requests: Map<string, number[]> = new Map();
  private lastPruneAt = 0;

  constructor(config: RateLimiterConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
  }

  check(clientId: string): RateLimiterResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const existing = this.requests.get(clientId);
    const timestamps = (existing ?? []).filter((time) => time > windowStart);

    if (timestamps.length >= this.maxRequests) {
      const oldestInWindow = timestamps[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        resetMs: Math.max(0, oldestInWindow + this.windowMs - now),
      };
    }

    if (now - this.lastPruneAt >= this.windowMs) {
      for (const [key, values] of this.requests) {
        if (!values.some((time) => time > windowStart)) {
          this.requests.delete(key);
        }
      }
      this.lastPruneAt = now;
    }

    if (!existing && this.requests.size >= this.maxClients) {
      return { allowed: false, remaining: 0, resetMs: this.windowMs };
    }

    timestamps.push(now);
    this.requests.set(clientId, timestamps);
    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetMs: this.windowMs,
    };
  }

  reset(clientId?: string): void {
    if (clientId) {
      this.requests.delete(clientId);
    } else {
      this.requests.clear();
    }
  }
}
