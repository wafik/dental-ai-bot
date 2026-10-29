import { describe, expect, it } from "bun:test";
import { KokoroTtsAdapter } from "../src/providers/tts/kokoro-tts-adapter";
import { TTSProviderError } from "../src/providers/tts/tts-provider";

describe("KokoroTtsAdapter", () => {
  it("posts text to Kokoro and returns audio bytes", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const adapter = new KokoroTtsAdapter({
      baseUrl: "https://kokoro.example/v1/",
      voice: "af_heart",
      fetchImpl: async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg; charset=binary" },
        });
      },
    });

    const result = await adapter.synthesize({ text: "Your appointment is confirmed." });
    expect(requestUrl).toBe("https://kokoro.example/v1/audio/speech");
    expect(requestInit?.method).toBe("POST");
    expect(new Headers(requestInit?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      model: "kokoro",
      voice: "af_heart",
      input: "Your appointment is confirmed.",
      response_format: "mp3",
    });
    expect(result.contentType).toBe("audio/mpeg");
    expect([...result.bytes]).toEqual([1, 2, 3]);
  });

  it("does not read or expose the upstream error body", async () => {
    const adapter = new KokoroTtsAdapter({
      baseUrl: "https://kokoro.example/v1",
      voice: "af_heart",
      fetchImpl: async () =>
        new Response("secret upstream content", {
          status: 502,
          headers: { "content-type": "text/plain" },
        }),
    });

    try {
      await adapter.synthesize({ text: "Private message" });
      throw new Error("expected request failure");
    } catch (error) {
      expect(error).toBeInstanceOf(TTSProviderError);
      expect((error as Error).message).not.toContain("secret upstream content");
      expect((error as Error).message).not.toContain("Private message");
      expect((error as TTSProviderError).status).toBe(502);
    }
  });

  it("sanitizes network errors", async () => {
    const adapter = new KokoroTtsAdapter({
      baseUrl: "https://kokoro.example/v1",
      voice: "af_heart",
      fetchImpl: async () => {
        throw new Error("network failure with private details");
      },
    });

    await expect(adapter.synthesize({ text: "Private message" })).rejects.toMatchObject({
      message: "Text-to-speech service is unavailable.",
      provider: "kokoro",
    });
  });

  it("rejects empty and non-audio responses", async () => {
    for (const response of [
      new Response(new Uint8Array(), { status: 200, headers: { "content-type": "audio/mpeg" } }),
      new Response("not audio", { status: 200, headers: { "content-type": "text/plain" } }),
    ]) {
      const adapter = new KokoroTtsAdapter({
        baseUrl: "https://kokoro.example/v1",
        voice: "af_heart",
        fetchImpl: async () => response,
      });
      await expect(adapter.synthesize({ text: "Hello" })).rejects.toBeInstanceOf(TTSProviderError);
    }
  });

  it("propagates caller cancellation to the provider request", async () => {
    const controller = new AbortController();
    let providerSignal: AbortSignal | undefined;
    const adapter = new KokoroTtsAdapter({
      baseUrl: "https://kokoro.example/v1",
      voice: "af_heart",
      fetchImpl: async (_input, init) => {
        providerSignal = init?.signal ?? undefined;
        controller.abort();
        return new Response(new Uint8Array([1]), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        });
      },
    });

    await adapter.synthesize({ text: "Hello", signal: controller.signal });
    expect(providerSignal?.aborted).toBe(true);
  });

  it("aborts stalled requests", async () => {
    const adapter = new KokoroTtsAdapter({
      baseUrl: "https://kokoro.example/v1",
      voice: "af_heart",
      timeoutMs: 1,
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    });

    await expect(adapter.synthesize({ text: "Hello" })).rejects.toBeInstanceOf(TTSProviderError);
  });
});
