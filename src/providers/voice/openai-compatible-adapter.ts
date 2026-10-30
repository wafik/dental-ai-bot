import { SYSTEM_PROMPT } from "../../safety/system-prompt";
import { APPOINTMENT_TOOL_DEFINITIONS } from "../../services/appointment-tools";
import {
  type VoiceProvider,
  VoiceProviderError,
  type VoiceSessionResponse,
  type VoiceToolDefinition,
} from "./voice-provider";

export type OpenAICompatibleVoiceAdapterOptions = {
  url: string;
  model: string;
};

/** Realtime tools carry an explicit `type`, unlike the neutral chat schema. */
function toRealtimeTools(): VoiceToolDefinition[] {
  return APPOINTMENT_TOOL_DEFINITIONS.map((tool) => ({ type: "function", ...tool }));
}

/**
 * Describes a self-hosted or third-party OpenAI Realtime-compatible endpoint.
 *
 * Unlike Gemini there is no server-side token to mint, so the endpoint is public
 * to the browser. The role and the tools still come from the server: the browser
 * applies this descriptor verbatim instead of carrying its own copy.
 */
export class OpenAICompatibleVoiceAdapter implements VoiceProvider {
  private readonly url: string;
  private readonly model: string;

  constructor(options: OpenAICompatibleVoiceAdapterOptions) {
    if (!options.url) {
      throw new VoiceProviderError("openai-compatible", "constructor", "Endpoint URL is required");
    }

    this.url = options.url;
    this.model = options.model;
  }

  async createSession(): Promise<VoiceSessionResponse> {
    if (!this.url.startsWith("ws://") && !this.url.startsWith("wss://")) {
      throw new VoiceProviderError(
        "openai-compatible",
        "createSession",
        "Endpoint must be a WebSocket URL",
      );
    }

    return {
      provider: "openai-compatible",
      sessionId: `sess_${Date.now().toString(36)}`,
      endpoint: this.url,
      instructions: SYSTEM_PROMPT,
      tools: toRealtimeTools(),
      model: this.model,
    };
  }
}
