/**
 * Role of a participant in an LLM conversation.
 */
export type LLMRole = "system" | "user" | "assistant" | "tool";

/**
 * Representation of a function tool call issued by the LLM.
 */
export type LLMToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

/**
 * Chat message types supported by the provider-neutral interface.
 */
export type LLMChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: LLMToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

/**
 * JSON schema definition for a tool/function that the LLM can call.
 */
export type LLMToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

/**
 * Request payload for provider-neutral chat completions.
 */
export type LLMChatRequest = {
  messages: LLMChatMessage[];
  tools?: LLMToolDefinition[];
  temperature?: number;
  maxTokens?: number;
};

/**
 * Normalized response payload from provider-neutral chat completions.
 */
export type LLMChatResponse = {
  message: {
    role: "assistant";
    content: string | null;
    toolCalls?: LLMToolCall[];
  };
  finishReason: "stop" | "tool_calls" | "length" | "error";
};

/**
 * Provider-neutral interface for conversational LLMs with tool-calling support.
 */
export type LLMProvider = {
  chat(request: LLMChatRequest): Promise<LLMChatResponse>;
};

/**
 * Initialization options for LLMProviderError.
 */
export type LLMProviderErrorOptions = {
  message: string;
  provider: string;
  operation: string;
  status?: number;
  cause?: unknown;
};

/**
 * Standard error thrown by LLM provider adapters.
 * Never embed API keys, authorization headers, or provider internal payloads in messages.
 */
export class LLMProviderError extends Error {
  readonly provider: string;
  readonly operation: string;
  readonly status?: number;
  override readonly cause?: unknown;

  constructor(options: LLMProviderErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "LLMProviderError";
    this.provider = options.provider;
    this.operation = options.operation;
    this.status = options.status;
    this.cause = options.cause;
  }
}
