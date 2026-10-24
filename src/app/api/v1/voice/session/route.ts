import { NextResponse } from "next/server";
import { OpenAIRealtimeAdapter } from "@/providers/voice/openai-realtime-adapter";
import type { VoiceProvider } from "@/providers/voice/voice-provider";

export type VoiceSessionRouteDeps = {
  voiceProvider?: VoiceProvider;
};

export function createVoiceSessionHandler(deps: VoiceSessionRouteDeps = {}) {
  return async function POST(_request: Request): Promise<Response> {
    try {
      const apiKey = process.env.OPENAI_API_KEY || "";
      const voiceProvider = deps.voiceProvider || new OpenAIRealtimeAdapter({ apiKey });

      const session = await voiceProvider.createSession();
      return NextResponse.json({ success: true, data: session }, { status: 200 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  };
}

export const POST = createVoiceSessionHandler();
