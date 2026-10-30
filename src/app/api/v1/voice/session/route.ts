import { NextResponse } from "next/server";
import { GeminiLiveAdapter } from "@/providers/voice/gemini-live-adapter";
import { OpenAICompatibleVoiceAdapter } from "@/providers/voice/openai-compatible-adapter";
import { getGeminiLiveConfig } from "@/config/gemini-live";
import { getOpenAICompatibleVoiceConfig } from "@/config/openai-compatible-voice";
import type { VoiceProvider } from "@/providers/voice/voice-provider";

export type VoiceSessionRouteDeps = {
  voiceProvider?: VoiceProvider;
};

const GENERIC_ERROR = "Internal server error";

/**
 * Selects the voice provider from configuration. `GEMINI_API_KEY` wins when both
 * are set; `OPENAI_COMPATIBLE_VOICE_URL` covers self-hosted or non-Google
 * providers so the app is not locked to one vendor.
 */
function buildVoiceProvider(env: Record<string, string | undefined>): VoiceProvider {
  if ((env.GEMINI_API_KEY ?? "").trim()) {
    return new GeminiLiveAdapter(getGeminiLiveConfig(env));
  }

  if ((env.OPENAI_COMPATIBLE_VOICE_URL ?? "").trim()) {
    return new OpenAICompatibleVoiceAdapter(getOpenAICompatibleVoiceConfig(env));
  }

  throw new Error(
    "No voice provider configured: set GEMINI_API_KEY or OPENAI_COMPATIBLE_VOICE_URL",
  );
}

export function createVoiceSessionHandler(deps: VoiceSessionRouteDeps = {}) {
  return async function POST(): Promise<Response> {
    try {
      const voiceProvider = deps.voiceProvider ?? buildVoiceProvider(process.env);

      const session = await voiceProvider.createSession();
      const {
        provider,
        sessionId,
        clientSecret,
        model,
        voice,
        expiresAt,
        endpoint,
        instructions,
        tools,
      } = session;
      return NextResponse.json(
        {
          success: true,
          data: {
            provider,
            sessionId,
            clientSecret,
            model,
            voice,
            expiresAt,
            endpoint,
            instructions,
            tools,
          },
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return NextResponse.json(
        { success: false, error: GENERIC_ERROR },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}

export const POST = createVoiceSessionHandler();

/**
 * Reports which provider is active so the browser can pick a transport before
 * minting anything. The session POST stays the only credential-bearing call.
 */
export async function GET(): Promise<Response> {
  try {
    const provider = (process.env.GEMINI_API_KEY ?? "").trim()
      ? "gemini-live"
      : (process.env.OPENAI_COMPATIBLE_VOICE_URL ?? "").trim()
        ? "openai-compatible"
        : null;

    if (!provider) {
      return NextResponse.json(
        { success: false, error: "No voice provider configured" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { success: true, data: { provider } },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 500 });
  }
}
