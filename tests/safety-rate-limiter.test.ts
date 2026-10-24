import { describe, expect, it } from "bun:test";
import { SlidingWindowRateLimiter } from "../src/safety/rate-limiter";

describe("SlidingWindowRateLimiter", () => {
  it("allows requests within rate limits", () => {
    const limiter = new SlidingWindowRateLimiter({
      maxRequests: 3,
      windowMs: 60000,
    });

    const clientId = "client-1";

    const r1 = limiter.check(clientId);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.check(clientId);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check(clientId);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks requests that exceed the limit", () => {
    const limiter = new SlidingWindowRateLimiter({
      maxRequests: 2,
      windowMs: 60000,
    });

    const clientId = "client-block";

    limiter.check(clientId);
    limiter.check(clientId);

    const blocked = limiter.check(clientId);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetMs).toBeGreaterThan(0);
  });

  it("tracks different client identifiers independently", () => {
    const limiter = new SlidingWindowRateLimiter({
      maxRequests: 1,
      windowMs: 60000,
    });

    const rA = limiter.check("client-A");
    expect(rA.allowed).toBe(true);

    const rABlocked = limiter.check("client-A");
    expect(rABlocked.allowed).toBe(false);

    const rB = limiter.check("client-B");
    expect(rB.allowed).toBe(true);
  });
});
