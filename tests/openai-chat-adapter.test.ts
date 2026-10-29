import { describe, expect, it, mock } from "bun:test";
import { getAIConfig } from "../src/config/ai";
import {
  LLMProviderError,
  type LLMChatMessage,
  type LLMToolDefinition,
} from "../src/providers/ai/llm-provider";
import { OpenAIChatAdapter } from "../src/providers/ai/openai-chat-adapter";

describe("getAIConfig", () => {
  it("returns default config when OPENAI_API_KEY is provided", () => {
    const config = getAIConfig({
      OPENAI_API_KEY: "sk-test-secret-key-12345",
    });

    expect(config.apiKey).toBe("sk-test-secret-key-12345");
    expect(config.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.model).toBe("gpt-4o-mini");
  });

  it("reads custom baseUrl and model when provided", () => {
    const config = getAIConfig({
      OPENAI_API_KEY: "sk-test-secret-key-12345",
      OPENAI_BASE_URL: "https://custom-openai-proxy.internal/v1",
      OPENAI_MODEL: "gpt-4o",
    });

    expect(config.apiKey).toBe("sk-test-secret-key-12345");
    expect(config.baseUrl).toBe("https://custom-openai-proxy.internal/v1");
    expect(config.model).toBe("gpt-4o");
  });

  it("throws an error when OPENAI_API_KEY is missing or empty", () => {
    expect(() => getAIConfig({})).toThrow(/OPENAI_API_KEY/);
    expect(() => getAIConfig({ OPENAI_API_KEY: "" })).toThrow(/OPENAI_API_KEY/);
    expect(() => getAIConfig({ OPENAI_API_KEY: "   " })).toThrow(/OPENAI_API_KEY/);
  });

  it("never leaks secret values in error messages", () => {
    try {
      getAIConfig({ OPENAI_API_KEY: "" });
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("sk-");
      expect(message).toContain("OPENAI_API_KEY");
    }
  });
});

describe("OpenAIChatAdapter", () => {
  const secretApiKey = "sk-live-secret-never-leak-this-key-xyz987";
  const defaultModel = "gpt-4o-mini";

  const createMockFetch = (handler: (req: Request) => Promise<Response>): typeof fetch => {
    return mock(async (input: string | URL | Request, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      return handler(req);
    }) as unknown as typeof fetch;
  };

  describe("Plain text completion parsing", () => {
    it("sends correct headers, body, and parses plain text assistant response", async () => {
      let capturedRequest: Request | null = null;
      let capturedBody: any = null;

      const mockFetch = createMockFetch(async (req) => {
        capturedRequest = req;
        capturedBody = await req.json();

        return new Response(
          JSON.stringify({
            id: "chatcmpl-test-1",
            object: "chat.completion",
            created: 1700000000,
            model: defaultModel,
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "Hello! How can I help you book a dental visit today?",
                },
                finish_reason: "stop",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      });

      const adapter = new OpenAIChatAdapter({
        apiKey: secretApiKey,
        fetchFn: mockFetch,
      });

      const messages: LLMChatMessage[] = [
        { role: "system", content: "You are a dental clinic assistant." },
        { role: "user", content: "Hi there!" },
      ];

      const response = await adapter.chat({
        messages,
        temperature: 0.2,
        maxTokens: 500,
      });

      // Verify request details
      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest!.url).toBe("https://api.openai.com/v1/chat/completions");
      expect(capturedRequest!.method).toBe("POST");
      expect(capturedRequest!.headers.get("Authorization")).toBe(`Bearer ${secretApiKey}`);
      expect(capturedRequest!.headers.get("Content-Type")).toBe("application/json");

      // Verify request body
      expect(capturedBody.model).toBe("gpt-4o-mini");
      expect(capturedBody.stream).toBe(false);
      expect(capturedBody.temperature).toBe(0.2);
      expect(capturedBody.max_tokens).toBe(500);
      expect(capturedBody.messages).toEqual([
        { role: "system", content: "You are a dental clinic assistant." },
        { role: "user", content: "Hi there!" },
      ]);

      // Verify parsed response
      expect(response.message.role).toBe("assistant");
      expect(response.message.content).toBe("Hello! How can I help you book a dental visit today?");
      expect(response.message.toolCalls).toBeUndefined();
      expect(response.finishReason).toBe("stop");
    });
  });

  describe("Function tool-calling parsing", () => {
    it("formats tool definitions and parses tool_calls with JSON arguments", async () => {
      let capturedBody: any = null;

      const mockFetch = createMockFetch(async (req) => {
        capturedBody = await req.json();

        return new Response(
          JSON.stringify({
            id: "chatcmpl-test-2",
            object: "chat.completion",
            created: 1700000001,
            model: defaultModel,
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_abc123",
                      type: "function",
                      function: {
                        name: "check_availability",
                        arguments: JSON.stringify({
                          dentistId: "senior-1",
                          date: "2026-10-25",
                        }),
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      });

      const adapter = new OpenAIChatAdapter({
        apiKey: secretApiKey,
        fetchFn: mockFetch,
      });

      const tools: LLMToolDefinition[] = [
        {
          name: "check_availability",
          description: "Check available appointment slots for a dentist on a specific date",
          parameters: {
            type: "object",
            properties: {
              dentistId: { type: "string" },
              date: { type: "string" },
            },
            required: ["dentistId", "date"],
          },
        },
      ];

      const response = await adapter.chat({
        messages: [{ role: "user", content: "Is Dr. Sarah free tomorrow?" }],
        tools,
      });

      // Verify tools formatting in request
      expect(capturedBody.tools).toEqual([
        {
          type: "function",
          function: {
            name: "check_availability",
            description: "Check available appointment slots for a dentist on a specific date",
            parameters: {
              type: "object",
              properties: {
                dentistId: { type: "string" },
                date: { type: "string" },
              },
              required: ["dentistId", "date"],
            },
          },
        },
      ]);

      // Verify parsed response
      expect(response.finishReason).toBe("tool_calls");
      expect(response.message.role).toBe("assistant");
      expect(response.message.content).toBeNull();
      expect(response.message.toolCalls).toHaveLength(1);
      expect(response.message.toolCalls![0]).toEqual({
        id: "call_abc123",
        name: "check_availability",
        arguments: {
          dentistId: "senior-1",
          date: "2026-10-25",
        },
      });
    });
  });

  describe("Sending tool result messages back to model", () => {
    it("formats tool role messages with tool_call_id and assistant tool calls in conversation history", async () => {
      let capturedBody: any = null;

      const mockFetch = createMockFetch(async (req) => {
        capturedBody = await req.json();

        return new Response(
          JSON.stringify({
            id: "chatcmpl-test-3",
            object: "chat.completion",
            created: 1700000002,
            model: defaultModel,
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "Dr. Sarah has available slots at 10:00 and 14:00.",
                },
                finish_reason: "stop",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      });

      const adapter = new OpenAIChatAdapter({
        apiKey: secretApiKey,
        fetchFn: mockFetch,
      });

      const conversation: LLMChatMessage[] = [
        { role: "user", content: "Is Dr. Sarah available on 2026-10-25?" },
        {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call_abc123",
              name: "check_availability",
              arguments: { dentistId: "senior-1", date: "2026-10-25" },
            },
          ],
        },
        {
          role: "tool",
          toolCallId: "call_abc123",
          name: "check_availability",
          content: JSON.stringify({ slots: ["10:00", "14:00"] }),
        },
      ];

      const response = await adapter.chat({ messages: conversation });

      // Verify messages array payload sent to OpenAI
      expect(capturedBody.messages).toHaveLength(3);
      expect(capturedBody.messages[0]).toEqual({
        role: "user",
        content: "Is Dr. Sarah available on 2026-10-25?",
      });
      expect(capturedBody.messages[1]).toEqual({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_abc123",
            type: "function",
            function: {
              name: "check_availability",
              arguments: JSON.stringify({ dentistId: "senior-1", date: "2026-10-25" }),
            },
          },
        ],
      });
      expect(capturedBody.messages[2]).toEqual({
        role: "tool",
        tool_call_id: "call_abc123",
        content: JSON.stringify({ slots: ["10:00", "14:00"] }),
      });

      expect(response.message.content).toBe("Dr. Sarah has available slots at 10:00 and 14:00.");
      expect(response.finishReason).toBe("stop");
    });
  });

  describe("Error handling and secret masking", () => {
    it("handles HTTP 401 Unauthorized without leaking API key", async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: `Incorrect API key provided: ${secretApiKey}`,
              type: "invalid_request_error",
              code: "invalid_api_key",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      });

      const adapter = new OpenAIChatAdapter({
        apiKey: secretApiKey,
        fetchFn: mockFetch,
      });

      try {
        await adapter.chat({ messages: [{ role: "user", content: "Hello" }] });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        const err = error as LLMProviderError;
        expect(err.provider).toBe("openai");
        expect(err.operation).toBe("chat");
        expect(err.status).toBe(401);
        expect(err.message).not.toContain(secretApiKey);
        expect(err.message).not.toContain("sk-");
      }
    });

    it("handles HTTP 429 Rate Limited", async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: "Rate limit reached for requests",
              type: "requests",
              code: "rate_limit_exceeded",
            },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      });

      const adapter = new OpenAIChatAdapter({
        apiKey: secretApiKey,
        fetchFn: mockFetch,
      });

      try {
        await adapter.chat({ messages: [{ role: "user", content: "Hello" }] });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        const err = error as LLMProviderError;
        expect(err.provider).toBe("openai");
        expect(err.operation).toBe("chat");
        expect(err.status).toBe(429);
      }
    });

    it("handles network failure by wrapping in LLMProviderError", async () => {
      const mockFetch = createMockFetch(async () => {
        throw new TypeError("Failed to fetch: network unreachable");
      });

      const adapter = new OpenAIChatAdapter({
        apiKey: secretApiKey,
        fetchFn: mockFetch,
      });

      try {
        await adapter.chat({ messages: [{ role: "user", content: "Hello" }] });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        const err = error as LLMProviderError;
        expect(err.provider).toBe("openai");
        expect(err.operation).toBe("chat");
        expect(err.cause).toBeDefined();
        expect(err.message).not.toContain(secretApiKey);
      }
    });

    it("handles invalid JSON response by throwing LLMProviderError", async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response("<html>502 Bad Gateway</html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        });
      });

      const adapter = new OpenAIChatAdapter({
        apiKey: secretApiKey,
        fetchFn: mockFetch,
      });

      try {
        await adapter.chat({ messages: [{ role: "user", content: "Hello" }] });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        const err = error as LLMProviderError;
        expect(err.provider).toBe("openai");
        expect(err.operation).toBe("chat");
        expect(err.status).toBe(502);
      }
    });

    it("handles malformed JSON payload in 200 OK by throwing LLMProviderError", async () => {
      const mockFetch = createMockFetch(async () => {
        return new Response("not-valid-json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const adapter = new OpenAIChatAdapter({
        apiKey: secretApiKey,
        fetchFn: mockFetch,
      });

      try {
        await adapter.chat({ messages: [{ role: "user", content: "Hello" }] });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        const err = error as LLMProviderError;
        expect(err.provider).toBe("openai");
        expect(err.operation).toBe("chat");
      }
    });
  });
});
