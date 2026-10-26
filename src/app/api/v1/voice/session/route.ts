import { NextResponse } from "next/server";
import { OpenAIRealtimeAdapter } from "@/providers/voice/openai-realtime-adapter";
import { getRuntimeOpenAiApiKey } from "@/services/runtime-config";
import type { VoiceProvider } from "@/providers/voice/voice-provider";

export type VoiceSessionRouteDeps = {
  voiceProvider?: VoiceProvider;
};

const GENERIC_ERROR = "Internal server error";

export function createVoiceSessionHandler(deps: VoiceSessionRouteDeps = {}) {
  return async function POST(_request: Request): Promise<Response> {
    try {
      const voiceProvider =
        deps.voiceProvider ?? new OpenAIRealtimeAdapter({ apiKey: await getRuntimeOpenAiApiKey() });

      const session = await voiceProvider.createSession();
      return NextResponse.json({ success: true, data: session }, { status: 200 });
    } catch {
      return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 500 });
    }
  };
}

export const POST = createVoiceSessionHandler();
