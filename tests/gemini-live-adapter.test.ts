import { describe, expect, it } from "bun:test";
import { GeminiLiveAdapter } from "../src/providers/voice/gemini-live-adapter";
import { VoiceProviderError } from "../src/providers/voice/voice-provider";
import { getGeminiLiveConfig } from "../src/config/gemini-live";

type Captured = { url: string; init: RequestInit };

function first<T>(items: T[]): T {
  const value = items[0];
  if (value === undefined) throw new Error("expected at least one item");
  return value;
}

function makeAdapter(
  responder: (url: string, init: RequestInit) => Response | Promise<Response>,
  overrides: Record<string, unknown> = {},
) {
  const captured: Captured[] = [];
  const adapter = new GeminiLiveAdapter({
    apiKey: "test-key",
    model: "gemini-3.8-live",
    voice: "Aoede",
    now: () => 1_700_000_000_000,
    fetchFn: (async (url: string, init: RequestInit) => {
      captured.push({ url: String(url), init });
      return responder(String(url), init);
    }) as unknown as typeof fetch,
    ...overrides,
  });
  return { adapter, captured };
}

describe("GeminiLiveAdapter", () => {
  it("rejects an empty API key", () => {
    expect(() => new GeminiLiveAdapter({ apiKey: "  ", model: "m", voice: "v" })).toThrow(
      VoiceProviderError,
    );
  });

  it("mints a locked, single-use ephemeral token", async () => {
    const { adapter, captured } = makeAdapter(
      () =>
        new Response(JSON.stringify({ name: "auth_tokens/abc-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const session = await adapter.createSession();

    expect(captured).toHaveLength(1);
    const request = first(captured);
    expect(request.url).toBe("https://generativelanguage.googleapis.com/v1beta/auth_tokens");

    const headers = request.init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("test-key");
    expect(headers.Authorization).toBeUndefined();

    const body = JSON.parse(String(request.init.body));
    expect(body.uses).toBe(1);
    expect(body.bidiGenerateContentSetup.model).toBe("models/gemini-3.8-live");
    expect(body.bidiGenerateContentSetup.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(
      body.bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig
        .voiceName,
    ).toBe("Aoede");
    expect(body.expireTime).toBe(new Date(1_700_000_000_000 + 30 * 60 * 1000).toISOString());

    // The token is locked to the role and tools; the browser cannot change them.
    expect(body.bidiGenerateContentSetup.systemInstruction.parts[0].text).toContain(
      "BrightSmile Clinic",
    );
    const declarations = body.bidiGenerateContentSetup.tools[0].functionDeclarations;
    expect(declarations.map((f: { name: string }) => f.name)).toContain("book_appointment");
    expect(declarations[0].parameters.type).toBe("OBJECT");

    expect(session.provider).toBe("gemini-live");
    expect(session.clientSecret).toBe("auth_tokens/abc-123");
    expect(session.model).toBe("gemini-3.8-live");
    expect(session.voice).toBe("Aoede");
    expect(session.expiresAt).toBe(1_700_000_000_000 + 30 * 60 * 1000);
  });

  it("maps an upstream failure to a status without leaking the key", async () => {
    const { adapter } = makeAdapter(() => new Response("denied", { status: 403 }));

    const error = await adapter.createSession().catch((err: unknown) => err);

    expect(error).toBeInstanceOf(VoiceProviderError);
    expect((error as VoiceProviderError).status).toBe(403);
    expect((error as VoiceProviderError).provider).toBe("gemini-live");
    expect((error as Error).message).not.toContain("test-key");
  });

  it("rejects a response without a token name", async () => {
    const { adapter } = makeAdapter(
      () => new Response(JSON.stringify({ name: "" }), { status: 200 }),
    );

    await expect(adapter.createSession()).rejects.toBeInstanceOf(VoiceProviderError);
  });

  it("maps a network throw to a generic error", async () => {
    const { adapter } = makeAdapter(() => {
      throw new TypeError("fetch failed");
    });

    const error = await adapter.createSession().catch((err: unknown) => err);

    expect(error).toBeInstanceOf(VoiceProviderError);
    expect((error as Error).message).toContain("Network request failed");
  });
});

describe("getGeminiLiveConfig", () => {
  it("requires GEMINI_API_KEY", () => {
    expect(() => getGeminiLiveConfig({})).toThrow("GEMINI_API_KEY");
    expect(() => getGeminiLiveConfig({ GEMINI_API_KEY: "   " })).toThrow("GEMINI_API_KEY");
  });

  it("falls back to documented defaults and honours overrides", () => {
    expect(getGeminiLiveConfig({ GEMINI_API_KEY: "k" })).toEqual({
      apiKey: "k",
      model: "gemini-2.5-flash-native-audio-latest",
      voice: "Aoede",
    });

    expect(
      getGeminiLiveConfig({
        GEMINI_API_KEY: "k",
        GEMINI_LIVE_MODEL: "m-1",
        GEMINI_LIVE_VOICE: "Puck",
      }),
    ).toEqual({ apiKey: "k", model: "m-1", voice: "Puck" });
  });

  it("rejects values that would corrupt the setup frame", () => {
    expect(() =>
      getGeminiLiveConfig({ GEMINI_API_KEY: "k", GEMINI_LIVE_MODEL: "bad/model?x=1" }),
    ).toThrow("GEMINI_LIVE_MODEL");

    expect(() => getGeminiLiveConfig({ GEMINI_API_KEY: "k", GEMINI_LIVE_VOICE: "a b" })).toThrow(
      "GEMINI_LIVE_VOICE",
    );
  });
});
