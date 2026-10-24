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
  private readonly requests: Map<string, number[]> = new Map();

  constructor(config: RateLimiterConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
  }

  check(clientId: string): RateLimiterResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.requests.get(clientId) || [];
    // Filter timestamps within current window
    timestamps = timestamps.filter((time) => time > windowStart);

    if (timestamps.length >= this.maxRequests) {
      const oldestInWindow = timestamps[0] ?? now;
      const resetMs = Math.max(0, oldestInWindow + this.windowMs - now);

      this.requests.set(clientId, timestamps);
      return {
        allowed: false,
        remaining: 0,
        resetMs,
      };
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
