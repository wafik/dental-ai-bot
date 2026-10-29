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
import {
  CHAT_REQUEST_MAX_BYTES,
  chatRequestSchema,
  type PublicChatMessage,
} from "@/utils/form-validation";

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

class ChatRequestTooLargeError extends Error {}

async function readBoundedJson(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > CHAT_REQUEST_MAX_BYTES)
    throw new ChatRequestTooLargeError();
  if (!request.body) throw new SyntaxError("Missing request body");
  const reader = request.body.getReader();
  const bytes = new Uint8Array(CHAT_REQUEST_MAX_BYTES);
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > CHAT_REQUEST_MAX_BYTES - total) {
        void reader.cancel().catch(() => {});
        throw new ChatRequestTooLargeError();
      }
      bytes.set(value, total);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total)));
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

      // 2. Validate payload before constructing runtime integrations
      let body: unknown;
      try {
        body = await readBoundedJson(request);
      } catch (error) {
        if (error instanceof ChatRequestTooLargeError)
          return NextResponse.json(
            { success: false, error: "Request body is too large" },
            { status: 413 },
          );
        if (error instanceof SyntaxError || error instanceof TypeError)
          return NextResponse.json(
            { success: false, error: "Invalid JSON request body" },
            { status: 400 },
          );
        throw error;
      }
      const parsed = chatRequestSchema.safeParse(body);
      if (!parsed.success)
        return NextResponse.json({ success: false, error: "Invalid messages" }, { status: 400 });
      const messages = parsed.data.messages;

      // 3. Prompt-Injection & Medical Advice Sanitization on latest user message
      const latestUserMessage = messages.at(-1);

      if (latestUserMessage) {
        const check = sanitizeUserInput(latestUserMessage.content);
        if (!check.isValid && check.deflectionMessage) {
          const deflectionReply = check.deflectionMessage;
          const updatedMessages: PublicChatMessage[] = [
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
          messages: [...messages, { role: "assistant", content: result.reply }],
        },
        { status: 200 },
      );
    } catch {
      return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 500 });
    }
  };
}

export const POST = createChatHandler();
