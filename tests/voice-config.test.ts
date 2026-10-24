import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { getVoiceConfig } from "../src/config/voice";

describe("Voice Config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default configuration when environment variables are unset", () => {
    delete process.env.OPENAI_REALTIME_MODEL;
    delete process.env.OPENAI_REALTIME_VOICE;

    const config = getVoiceConfig();
    expect(config.model).toBe("gpt-4o-realtime-preview-2024-12-17");
    expect(config.voice).toBe("alloy");
    expect(config.modalities).toEqual(["text", "audio"]);
    expect(config.temperature).toBe(0.7);
  });

  it("reads model and voice from environment variables", () => {
    process.env.OPENAI_REALTIME_MODEL = "gpt-4o-realtime-custom";
    process.env.OPENAI_REALTIME_VOICE = "shimmer";

    const config = getVoiceConfig();
    expect(config.model).toBe("gpt-4o-realtime-custom");
    expect(config.voice).toBe("shimmer");
  });

  it("provides turn detection settings configured with server_vad", () => {
    const config = getVoiceConfig();
    expect(config.turnDetection?.type).toBe("server_vad");
    expect(config.turnDetection?.threshold).toBe(0.5);
    expect(config.turnDetection?.silenceDurationMs).toBe(500);
  });
});
