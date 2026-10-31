import { describe, expect, it } from "bun:test";
import { OpenAICompatibleVoiceAdapter } from "../src/providers/voice/openai-compatible-adapter";
import {
  getOpenAICompatibleVoiceConfig,
  OPENAI_COMPATIBLE_VOICE_DEFAULTS,
} from "../src/config/openai-compatible-voice";
import { VoiceProviderError } from "../src/providers/voice/voice-provider";

describe("OpenAICompatibleVoiceAdapter", () => {
  it("describes the endpoint with the server-owned role and tools", async () => {
    const adapter = new OpenAICompatibleVoiceAdapter({
      url: "ws://127.0.0.1:8765/v1/realtime",
      model: "gpt-realtime",
    });

    const session = await adapter.createSession();

    expect(session.provider).toBe("openai-compatible");
    expect(session.endpoint).toBe("ws://127.0.0.1:8765/v1/realtime");
    expect(session.model).toBe("gpt-realtime");
    expect(session.instructions).toContain("BrightSmile Clinic");
    expect(session.tools?.map((tool) => tool.name as string)).toContain("book_appointment");
    // There is no server-side token to mint for this provider.
    expect(session.clientSecret).toBeUndefined();
  });

  it("rejects a non-WebSocket endpoint without making a request", async () => {
    const adapter = new OpenAICompatibleVoiceAdapter({ url: "https://example.test", model: "m" });

    await expect(adapter.createSession()).rejects.toBeInstanceOf(VoiceProviderError);
  });

  it("rejects an empty endpoint", () => {
    expect(() => new OpenAICompatibleVoiceAdapter({ url: "", model: "m" })).toThrow(
      VoiceProviderError,
    );
  });
});

describe("getOpenAICompatibleVoiceConfig", () => {
  it("requires OPENAI_COMPATIBLE_VOICE_URL", () => {
    expect(() => getOpenAICompatibleVoiceConfig({})).toThrow("OPENAI_COMPATIBLE_VOICE_URL");
  });

  it("accepts ws and wss and defaults the model", () => {
    expect(
      getOpenAICompatibleVoiceConfig({
        OPENAI_COMPATIBLE_VOICE_URL: "ws://127.0.0.1:8765/v1/realtime",
      }),
    ).toEqual({
      url: "ws://127.0.0.1:8765/v1/realtime",
      model: OPENAI_COMPATIBLE_VOICE_DEFAULTS.model,
    });

    expect(
      getOpenAICompatibleVoiceConfig({
        OPENAI_COMPATIBLE_VOICE_URL: "wss://voice.example.test/realtime",
        OPENAI_COMPATIBLE_VOICE_MODEL: "local-model",
      }),
    ).toEqual({ url: "wss://voice.example.test/realtime", model: "local-model" });
  });

  it("rejects an http URL and a malformed model", () => {
    expect(() =>
      getOpenAICompatibleVoiceConfig({ OPENAI_COMPATIBLE_VOICE_URL: "http://127.0.0.1:8765" }),
    ).toThrow("ws:// or wss://");

    expect(() =>
      getOpenAICompatibleVoiceConfig({
        OPENAI_COMPATIBLE_VOICE_URL: "ws://127.0.0.1:8765/v1/realtime",
        OPENAI_COMPATIBLE_VOICE_MODEL: "bad model",
      }),
    ).toThrow("OPENAI_COMPATIBLE_VOICE_MODEL");
  });
});
