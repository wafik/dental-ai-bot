import { describe, expect, it } from "bun:test";
import { VoiceProviderError } from "../src/providers/voice/voice-provider";

describe("Voice Provider Contract & Error", () => {
  it("formats VoiceProviderError with provider, operation, and message", () => {
    const error = new VoiceProviderError(
      "openai-realtime",
      "createSession",
      "Failed to connect",
      502,
    );

    expect(error.name).toBe("VoiceProviderError");
    expect(error.provider).toBe("openai-realtime");
    expect(error.operation).toBe("createSession");
    expect(error.status).toBe(502);
    expect(error.message).toBe("[openai-realtime:createSession] Failed to connect");
  });

  it("sanitizes error message to prevent leaking bearer tokens or keys", () => {
    const rawError = "Authorization failed for Bearer sk-proj-1234567890abcdef";
    const sanitizedError = VoiceProviderError.sanitize(rawError);

    expect(sanitizedError).not.toContain("sk-proj-1234567890abcdef");
    expect(sanitizedError).toContain("[REDACTED]");
  });

  it("creates a sanitized VoiceProviderError from raw error string", () => {
    const error = VoiceProviderError.fromRaw(
      "openai-realtime",
      "createSession",
      "Invalid key Bearer sk-live-secretkey",
      401,
    );

    expect(error.message).not.toContain("sk-live-secretkey");
    expect(error.message).toContain("[REDACTED]");
    expect(error.status).toBe(401);
  });
});
