import { NextResponse } from "next/server";
import { SlidingWindowRateLimiter } from "@/safety/rate-limiter";
import { sanitizeUserInput } from "@/safety/sanitizer";
import { ChatOrchestrator } from "@/services/chat-orchestrator";
import { AppointmentService } from "@/services/appointment-service";
import { getRuntimeCalendarProvider } from "@/services/calendar-provider-cache";
import { getRuntimeAiConfig } from "@/services/runtime-config";
import { getRuntimeAppointmentRepository } from "@/repository/runtime-repositories";
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

const GENERIC_ERROR = "Internal server error";

/**
 * Builds an orchestrator per request from runtime configuration so credential
 * and provider changes made in the admin area apply without a restart.
 */
async function buildRuntimeOrchestrator(): Promise<ChatOrchestrator> {
  const aiConfig = await getRuntimeAiConfig();
  const calendarProvider = await getRuntimeCalendarProvider();
  const appointmentService = new AppointmentService(
    getRuntimeAppointmentRepository(),
    calendarProvider,
  );

  return new ChatOrchestrator({
    llmProvider: new OpenAIChatAdapter({
      apiKey: aiConfig.apiKey,
      baseUrl: aiConfig.baseUrl,
      model: aiConfig.model,
    }),
    appointmentService,
    systemPrompt: SYSTEM_PROMPT,
  });
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
      const orchestrator = deps.orchestrator ?? (await buildRuntimeOrchestrator());
      const result = await orchestrator.handleUserMessage(messages);

      return NextResponse.json(
        {
          success: true,
          reply: result.reply,
          messages: result.messages,
        },
        { status: 200 },
      );
    } catch {
      return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 500 });
    }
  };
}

export const POST = createChatHandler();
