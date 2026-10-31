import type { LLMChatMessage, LLMProvider } from "../providers/ai/llm-provider";
import { SYSTEM_PROMPT } from "../safety/system-prompt";
import type { AppointmentService } from "./appointment-service";
import { APPOINTMENT_TOOL_DEFINITIONS, executeAppointmentTool } from "./appointment-tools";

export type ChatOrchestratorOptions = {
  llmProvider: LLMProvider;
  appointmentService: AppointmentService;
  systemPrompt?: string;
  maxIterations?: number;
};

export type ChatOrchestratorResult = {
  reply: string;
  messages: LLMChatMessage[];
};

const DEFAULT_MAX_ITERATIONS = 5;

const DEFAULT_FALLBACK_REPLY =
  "I apologize, but I was unable to complete your request due to an internal limit. Please contact BrightSmile Clinic directly for assistance.";

/**
 * Orchestrates multi-turn conversational chat sessions with the LLM,
 * coordinating tool calls, injecting system prompt guardrails, and enforcing iteration bounds.
 */
export class ChatOrchestrator {
  private readonly llmProvider: LLMProvider;
  private readonly appointmentService: AppointmentService;
  private readonly systemPrompt: string;
  private readonly maxIterations: number;

  constructor(options: ChatOrchestratorOptions) {
    this.llmProvider = options.llmProvider;
    this.appointmentService = options.appointmentService;
    this.systemPrompt = options.systemPrompt ?? SYSTEM_PROMPT;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  }

  /**
   * Processes a user message turn within an existing or new conversation history.
   * Injects the trusted system prompt, dispatches tool calls in a loop,
   * and returns the final assistant reply alongside the updated conversation history.
   */
  async handleUserMessage(
    history: LLMChatMessage[],
    userMessage?: string,
  ): Promise<ChatOrchestratorResult> {
    const messages: LLMChatMessage[] = [{ role: "system", content: this.systemPrompt }];
    for (const message of history) {
      if (
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string"
      ) {
        messages.push({ role: message.role, content: message.content });
      }
    }

    // Append new user message if provided
    if (userMessage !== undefined) {
      messages.push({
        role: "user",
        content: userMessage,
      });
    }

    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      const response = await this.llmProvider.chat({
        messages: [...messages],
        tools: APPOINTMENT_TOOL_DEFINITIONS,
      });

      const assistantMsg = response.message;
      messages.push(assistantMsg);

      const toolCalls = assistantMsg.toolCalls;

      // If no tool calls or finishReason is stop, return final assistant reply
      if (!toolCalls || toolCalls.length === 0 || response.finishReason === "stop") {
        return {
          reply: assistantMsg.content ?? "",
          messages,
        };
      }

      // Execute each tool call and append tool output messages
      for (const call of toolCalls) {
        let toolOutput: string;
        try {
          toolOutput = await executeAppointmentTool(
            this.appointmentService,
            call.name,
            call.arguments,
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          toolOutput = JSON.stringify({ success: false, error: message });
        }

        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: toolOutput,
        });
      }
    }

    // Reached max iterations without completion - return graceful fallback
    messages.push({
      role: "assistant",
      content: DEFAULT_FALLBACK_REPLY,
    });

    return {
      reply: DEFAULT_FALLBACK_REPLY,
      messages,
    };
  }
}
