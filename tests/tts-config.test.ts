import { describe, expect, it } from "bun:test";
import { getTTSConfig } from "../src/config/tts";

describe("getTTSConfig", () => {
  it("trims the base URL and defaults to the Kokoro heart voice", () => {
    expect(
      getTTSConfig({
        KOKORO_TTS_BASE_URL: " https://kokoro.example/v1/// ",
        KOKORO_TTS_VOICE: " ",
      }),
    ).toEqual({ baseUrl: "https://kokoro.example/v1", voice: "af_heart" });
    expect(getTTSConfig({ KOKORO_TTS_BASE_URL: "http://localhost:8880/v1" }).baseUrl).toBe(
      "http://localhost:8880/v1",
    );
  });

  it("rejects non-loopback HTTP endpoints", () => {
    expect(() => getTTSConfig({ KOKORO_TTS_BASE_URL: "http://kokoro.example/v1" })).toThrow(
      "Text-to-speech service is unavailable.",
    );
  });

  it("accepts loopback HTTP with an explicit port", () => {
    expect(getTTSConfig({ KOKORO_TTS_BASE_URL: "http://localhost:8880/v1" }).baseUrl).toBe(
      "http://localhost:8880/v1",
    );
  });

  it("accepts a configured voice", () => {
    expect(
      getTTSConfig({ KOKORO_TTS_BASE_URL: "https://kokoro.local/v1", KOKORO_TTS_VOICE: "bf_emma" })
        .voice,
    ).toBe("bf_emma");
  });

  it("rejects a missing base URL with a generic error", () => {
    expect(() => getTTSConfig({})).toThrow("Text-to-speech service is unavailable.");
  });

  it("rejects unsafe URLs without echoing credentials or query values", () => {
    const unsafeUrl = "https://person:secret@tts.example/v1?token=private";
    let errorMessage = "";
    try {
      getTTSConfig({ KOKORO_TTS_BASE_URL: unsafeUrl });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    expect(errorMessage).toBe("Text-to-speech service is unavailable.");
    expect(errorMessage).not.toContain("secret");
    expect(errorMessage).not.toContain("private");
  });

  it("rejects non-HTTP protocols", () => {
    expect(() => getTTSConfig({ KOKORO_TTS_BASE_URL: "file:///tmp/tts" })).toThrow(
      "Text-to-speech service is unavailable.",
    );
  });
});
