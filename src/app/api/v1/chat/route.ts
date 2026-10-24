import { NextResponse } from "next/server";
import { SlidingWindowRateLimiter } from "@/safety/rate-limiter";
import { sanitizeUserInput } from "@/safety/sanitizer";
import { ChatOrchestrator } from "@/services/chat-orchestrator";
import { AppointmentService } from "@/services/appointment-service";
import { InMemoryAppointmentRepository } from "@/repository/in-memory-appointment-repository";
import { OpenAIChatAdapter } from "@/providers/ai/openai-chat-adapter";
import { SYSTEM_PROMPT } from "@/safety/system-prompt";
import type { LLMChatMessage } from "@/providers/ai/llm-provider";

export type ChatRouteDeps = {
  orchestrator?: ChatOrchestrator;
  rateLimiter?: SlidingWindowRateLimiter;
};

const defaultLimiter = new SlidingWindowRateLimiter({
  maxRequests: 30,
  windowMs: 60000,
});

let defaultOrchestrator: ChatOrchestrator | null = null;

function getDefaultOrchestrator(): ChatOrchestrator {
  if (!defaultOrchestrator) {
    const repository = new InMemoryAppointmentRepository();
    const service = new AppointmentService(repository);
    const llm = new OpenAIChatAdapter({ apiKey: process.env.OPENAI_API_KEY || "mock-key" });
    defaultOrchestrator = new ChatOrchestrator({
      llmProvider: llm,
      appointmentService: service,
      systemPrompt: SYSTEM_PROMPT,
    });
  }
  return defaultOrchestrator;
}

export function createChatHandler(deps: ChatRouteDeps = {}) {
  const limiter = deps.rateLimiter || defaultLimiter;

  return async function POST(request: Request): Promise<Response> {
    try {
      // 1. Rate Limiting Check
      const clientIp = request.headers.get("x-forwarded-for") || "client-local";
      const limitResult = limiter.check(clientIp);

      if (!limitResult.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "Too many requests. Please wait a moment before sending another message.",
          },
          { status: 429 },
        );
      }

      // 2. Validate payload
      const body = await request.json();
      const messages = body?.messages as LLMChatMessage[] | undefined;

      if (!Array.isArray(messages) || messages.length === 0) {
        return NextResponse.json(
          { success: false, error: "messages array is required and must not be empty" },
          { status: 400 },
        );
      }

      // 3. Prompt-Injection & Medical Advice Sanitization on latest user message
      const latestUserMessage = [...messages].reverse().find((m) => m.role === "user");

      if (latestUserMessage && typeof latestUserMessage.content === "string") {
        const check = sanitizeUserInput(latestUserMessage.content);
        if (!check.isValid && check.deflectionMessage) {
          const deflectionReply = check.deflectionMessage;
          const updatedMessages: LLMChatMessage[] = [
            ...messages,
            { role: "assistant", content: deflectionReply },
          ];

          return NextResponse.json(
            {
              success: true,
              reply: deflectionReply,
              messages: updatedMessages,
            },
            { status: 200 },
          );
        }
      }

      // 4. Execute Chat Orchestrator
      const orchestrator = deps.orchestrator || getDefaultOrchestrator();
      const result = await orchestrator.handleUserMessage(messages);

      return NextResponse.json(
        {
          success: true,
          reply: result.reply,
          messages: result.messages,
        },
        { status: 200 },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  };
}

export const POST = createChatHandler();
