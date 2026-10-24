import { getVoiceConfig } from "../../config/voice";
import { SYSTEM_PROMPT } from "../../safety/system-prompt";
import { APPOINTMENT_TOOL_DEFINITIONS } from "../../services/appointment-tools";
import {
  type VoiceProvider,
  VoiceProviderError,
  type VoiceSessionConfig,
  type VoiceSessionResponse,
} from "./voice-provider";

export type OpenAIRealtimeAdapterOptions = {
  apiKey: string;
  baseUrl?: string;
};

export class OpenAIRealtimeAdapter implements VoiceProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: OpenAIRealtimeAdapterOptions) {
    if (!options.apiKey || options.apiKey.trim().length === 0) {
      throw new VoiceProviderError("openai-realtime", "constructor", "API key is required");
    }
    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  async createSession(customConfig?: Partial<VoiceSessionConfig>): Promise<VoiceSessionResponse> {
    const defaultVoiceConfig = getVoiceConfig();

    const payload = {
      model: customConfig?.model || defaultVoiceConfig.model,
      voice: customConfig?.voice || defaultVoiceConfig.voice,
      modalities: customConfig?.modalities || defaultVoiceConfig.modalities,
      instructions: customConfig?.instructions || SYSTEM_PROMPT,
      tools: customConfig?.tools || APPOINTMENT_TOOL_DEFINITIONS,
      temperature: customConfig?.temperature ?? defaultVoiceConfig.temperature,
      turn_detection:
        customConfig?.turnDetection !== undefined
          ? customConfig.turnDetection
          : {
              type: defaultVoiceConfig.turnDetection.type,
              threshold: defaultVoiceConfig.turnDetection.threshold,
              prefix_padding_ms: defaultVoiceConfig.turnDetection.prefixPaddingMs,
              silence_duration_ms: defaultVoiceConfig.turnDetection.silenceDurationMs,
            },
      ...(customConfig?.inputAudioTranscription
        ? { input_audio_transcription: customConfig.inputAudioTranscription }
        : {}),
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/realtime/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw VoiceProviderError.fromRaw(
        "openai-realtime",
        "createSession",
        `Network error: ${message}`,
      );
    }

    if (!response.ok) {
      const rawText = await response.text();
      let errorDetail = rawText;
      try {
        const parsed = JSON.parse(rawText);
        if (parsed.error?.message) {
          errorDetail = parsed.error.message;
        }
      } catch {
        // keep raw text
      }

      throw VoiceProviderError.fromRaw(
        "openai-realtime",
        "createSession",
        `OpenAI Realtime API error (status ${response.status}): ${errorDetail}`,
        response.status,
      );
    }

    const data = await response.json();

    const clientSecretValue = data.client_secret?.value;
    if (!clientSecretValue) {
      throw new VoiceProviderError(
        "openai-realtime",
        "createSession",
        "Missing client_secret.value in OpenAI response",
        response.status,
      );
    }

    return {
      sessionId: data.id || `sess_${Date.now()}`,
      clientSecret: clientSecretValue,
      model: data.model || payload.model,
      voice: data.voice || payload.voice,
      expiresAt: data.client_secret?.expires_at,
    };
  }
}
