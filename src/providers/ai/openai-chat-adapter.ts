import {
  LLMProviderError,
  type LLMChatMessage,
  type LLMChatRequest,
  type LLMChatResponse,
  type LLMProvider,
  type LLMToolCall,
} from "./llm-provider";

export type OpenAIChatAdapterConfig = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
};

/**
 * OpenAI chat completion API response choice structure.
 */
type OpenAIChoice = {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  finish_reason: string;
};

type OpenAIChatCompletionResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices?: OpenAIChoice[];
};

/**
 * Adapter implementing the LLMProvider interface for OpenAI and compatible APIs.
 */
export class OpenAIChatAdapter implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: OpenAIChatAdapterConfig) {
    this.apiKey = config.apiKey.trim();
    this.baseUrl = (config.baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.model = config.model?.trim() || "gpt-4o-mini";
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  async chat(request: LLMChatRequest): Promise<LLMChatResponse> {
    const formattedMessages = request.messages.map((msg) => this.formatMessage(msg));

    const payload: Record<string, unknown> = {
      model: this.model,
      messages: formattedMessages,
    };

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
    }

    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      payload.max_tokens = request.maxTokens;
    }

    const endpoint = `${this.baseUrl}/chat/completions`;

    let response: Response;
    try {
      response = await this.fetchFn(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (networkError) {
      throw new LLMProviderError({
        message: "Network error occurred while calling OpenAI chat completion",
        provider: "openai",
        operation: "chat",
        cause: networkError,
      });
    }

    if (!response.ok) {
      throw new LLMProviderError({
        message: `OpenAI chat completion request failed with status ${response.status}`,
        provider: "openai",
        operation: "chat",
        status: response.status,
      });
    }

    let data: OpenAIChatCompletionResponse;
    try {
      data = (await response.json()) as OpenAIChatCompletionResponse;
    } catch (jsonError) {
      throw new LLMProviderError({
        message: "Failed to parse OpenAI chat completion response as JSON",
        provider: "openai",
        operation: "chat",
        status: response.status,
        cause: jsonError,
      });
    }

    const choice = data.choices?.[0];
    if (!choice || !choice.message) {
      throw new LLMProviderError({
        message: "OpenAI response missing valid choices or message",
        provider: "openai",
        operation: "chat",
        status: response.status,
      });
    }

    const rawMessage = choice.message;
    let toolCalls: LLMToolCall[] | undefined;

    if (Array.isArray(rawMessage.tool_calls) && rawMessage.tool_calls.length > 0) {
      toolCalls = rawMessage.tool_calls.map((tc) => {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments);
        } catch {
          parsedArgs = {};
        }

        return {
          id: tc.id,
          name: tc.function.name,
          arguments: parsedArgs,
        };
      });
    }

    let finishReason: "stop" | "tool_calls" | "length" | "error";
    switch (choice.finish_reason) {
      case "stop":
        finishReason = "stop";
        break;
      case "tool_calls":
        finishReason = "tool_calls";
        break;
      case "length":
        finishReason = "length";
        break;
      default:
        finishReason = "error";
        break;
    }

    return {
      message: {
        role: "assistant",
        content: rawMessage.content ?? null,
        ...(toolCalls ? { toolCalls } : {}),
      },
      finishReason,
    };
  }

  private formatMessage(msg: LLMChatMessage): Record<string, unknown> {
    switch (msg.role) {
      case "system":
        return {
          role: "system",
          content: msg.content,
        };
      case "user":
        return {
          role: "user",
          content: msg.content,
        };
      case "assistant": {
        const assistantMsg: Record<string, unknown> = {
          role: "assistant",
          content: msg.content,
        };

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          }));
        }

        return assistantMsg;
      }
      case "tool":
        return {
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: msg.content,
        };
    }
  }
}
