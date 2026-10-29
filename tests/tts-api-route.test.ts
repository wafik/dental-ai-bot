import { describe, expect, it } from "bun:test";
import { createTTSHandler } from "../src/app/api/v1/tts/route";
import type { TTSProvider } from "../src/providers/tts/tts-provider";
import { SlidingWindowRateLimiter } from "../src/safety/rate-limiter";

const fakeProvider: TTSProvider = {
  synthesize: async () => ({ bytes: new Uint8Array([9, 8, 7]), contentType: "audio/mpeg" }),
};

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/v1/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

describe("POST /api/v1/tts", () => {
  it("rejects malformed JSON", async () => {
    const response = await createTTSHandler({ provider: fakeProvider })(request("{"));
    expect(response.status).toBe(400);
  });

  it("rejects missing, blank, and oversized text", async () => {
    const handler = createTTSHandler({ provider: fakeProvider });
    for (const body of [
      "{}",
      JSON.stringify({ text: "   " }),
      JSON.stringify({ text: "x".repeat(4001) }),
    ]) {
      expect((await handler(request(body))).status).toBe(400);
    }
  });

  it("rejects bodies larger than 16 KiB", async () => {
    const handler = createTTSHandler({ provider: fakeProvider });
    expect((await handler(request(" ".repeat(16 * 1024 + 1)))).status).toBe(413);
    expect(
      (
        await handler(
          request(JSON.stringify({ text: "ok" }), { "Content-Length": String(16 * 1024 + 1) }),
        )
      ).status,
    ).toBe(413);
  });

  it("returns audio bytes with no-store headers", async () => {
    const handler = createTTSHandler({ provider: fakeProvider });
    const response = await handler(request(JSON.stringify({ text: "Hello" })));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([9, 8, 7]);
  });

  it("uses one rate-limit bucket instead of trusting caller-supplied forwarded-for values", async () => {
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    const handler = createTTSHandler({ provider: fakeProvider, rateLimiter: limiter });
    expect((await handler(request(JSON.stringify({ text: "One" })))).status).toBe(200);
    const limited = await handler(
      request(JSON.stringify({ text: "Two" }), { "x-forwarded-for": "198.51.100.5" }),
    );
    expect(limited.status).toBe(429);
  });

  it("propagates request cancellation to provider synthesis", async () => {
    let providerSignal: AbortSignal | undefined;
    const provider: TTSProvider = {
      synthesize: async ({ signal }) => {
        providerSignal = signal;
        return { bytes: new Uint8Array([1]), contentType: "audio/mpeg" };
      },
    };
    const controller = new AbortController();
    const handler = createTTSHandler({ provider });
    const response = await handler(
      new Request("http://localhost/api/v1/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello" }),
        signal: controller.signal,
      }),
    );
    expect(response.status).toBe(200);
    expect(providerSignal).toBe(controller.signal);
    controller.abort();
    expect(providerSignal?.aborted).toBe(true);
  });

  it("rejects unbounded unique limiter keys once capacity is reached", () => {
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    for (let i = 0; i < 10_000; i += 1) {
      expect(limiter.check(`client-${i}`).allowed).toBe(true);
    }
    expect(limiter.check("attacker-controlled-new-key").allowed).toBe(false);
  });

  it("accepts a fixed request size regardless of network chunking", async () => {
    const handler = createTTSHandler({ provider: fakeProvider });
    const body = JSON.stringify({ text: "x".repeat(4000) });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(body);
        for (let offset = 0; offset < bytes.length; offset += 128) {
          controller.enqueue(bytes.subarray(offset, offset + 128));
        }
        controller.close();
      },
    });
    const response = await handler(
      new Request("http://localhost/api/v1/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: stream,
        // Bun's Request implementation does not infer Content-Length for streaming bodies.
        duplex: "half",
      } as RequestInit & { duplex: "half" }),
    );
    expect(response.status).toBe(200);
  });

  it("returns 503 when no Kokoro service is configured", async () => {
    const response = await createTTSHandler({ env: {} })(
      request(JSON.stringify({ text: "Hello" })),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      error: "Text-to-speech is not configured.",
    });
  });

  it("does not expose provider errors or submitted text", async () => {
    const provider: TTSProvider = {
      synthesize: async () => {
        throw new Error("upstream response includes private message");
      },
    };
    const response = await createTTSHandler({ provider })(
      request(JSON.stringify({ text: "Private reply" })),
    );
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).not.toContain("upstream");
    expect(body).not.toContain("Private reply");
  });
});
