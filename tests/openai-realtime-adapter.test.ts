import { afterEach, describe, expect, it } from "bun:test";
import { SYSTEM_PROMPT } from "../src/safety/system-prompt";
import { APPOINTMENT_TOOL_DEFINITIONS } from "../src/services/appointment-tools";
import { OpenAIRealtimeAdapter } from "../src/providers/voice/openai-realtime-adapter";
import { VoiceProviderError } from "../src/providers/voice/voice-provider";

describe("OpenAIRealtimeAdapter", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws error when API key is missing", () => {
    expect(() => new OpenAIRealtimeAdapter({ apiKey: "" })).toThrow(VoiceProviderError);
  });

  it("creates a realtime session with default instructions, tools, and voice", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedHeaders = init?.headers as Record<string, string>;
      capturedBody = JSON.parse(init?.body as string);

      return new Response(
        JSON.stringify({
          id: "sess_test_123",
          object: "realtime.session",
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "alloy",
          client_secret: {
            value: "ek_test_secret_456",
            expires_at: 1730000000,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const adapter = new OpenAIRealtimeAdapter({ apiKey: "sk-mock-key-123" });
    const session = await adapter.createSession();

    expect(capturedUrl).toBe("https://api.openai.com/v1/realtime/sessions");
    expect(capturedHeaders.Authorization).toBe("Bearer sk-mock-key-123");
    expect(capturedBody.model).toBe("gpt-4o-realtime-preview-2024-12-17");
    expect(capturedBody.voice).toBe("alloy");
    expect(capturedBody.instructions).toBe(SYSTEM_PROMPT);
    expect(capturedBody.tools).toHaveLength(APPOINTMENT_TOOL_DEFINITIONS.length);
    expect(capturedBody.turn_detection?.type).toBe("server_vad");

    expect(session.sessionId).toBe("sess_test_123");
    expect(session.clientSecret).toBe("ek_test_secret_456");
    expect(session.expiresAt).toBe(1730000000);
  });

  it("merges custom configuration when provided", async () => {
    let capturedBody: any = null;

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          id: "sess_custom",
          client_secret: { value: "ek_custom" },
          model: "gpt-4o-custom",
          voice: "verse",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const adapter = new OpenAIRealtimeAdapter({ apiKey: "sk-mock-key" });
    const session = await adapter.createSession({
      voice: "verse",
      temperature: 0.4,
    });

    expect(capturedBody.voice).toBe("verse");
    expect(capturedBody.temperature).toBe(0.4);
    expect(session.voice).toBe("verse");
    expect(session.provider).toBe("openai-realtime");
  });

  it("handles 401 Unauthorized without leaking API key", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: "Incorrect API key provided: sk-secret-leak",
            type: "invalid_request_error",
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const adapter = new OpenAIRealtimeAdapter({ apiKey: "sk-secret-leak" });

    try {
      await adapter.createSession();
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err).toBeInstanceOf(VoiceProviderError);
      expect(err.status).toBe(401);
      expect(err.message).not.toContain("sk-secret-leak");
      expect(err.message).toContain("OpenAI Realtime API request failed");
      expect(err.message).not.toContain("Incorrect API key provided");
    }
  });

  it("handles 429 Rate Limit response", async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const adapter = new OpenAIRealtimeAdapter({ apiKey: "sk-mock-key" });

    try {
      await adapter.createSession();
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err).toBeInstanceOf(VoiceProviderError);
      expect(err.status).toBe(429);
    }
  });

  it("handles network failure gracefully", async () => {
    globalThis.fetch = (async () => {
      throw new Error("Connection reset by peer");
    }) as unknown as typeof fetch;

    const adapter = new OpenAIRealtimeAdapter({ apiKey: "sk-mock-key" });

    try {
      await adapter.createSession();
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err).toBeInstanceOf(VoiceProviderError);
      expect(err.message).toContain("Network request failed");
      expect(err.message).not.toContain("Connection reset by peer");
    }
  });
});
