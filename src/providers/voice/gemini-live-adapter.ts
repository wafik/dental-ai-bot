import { GEMINI_TOKEN_START_WINDOW_MS, GEMINI_TOKEN_TTL_MS } from "../../config/gemini-live";
import { APPOINTMENT_TOOL_DEFINITIONS } from "../../services/appointment-tools";
import { SYSTEM_PROMPT } from "../../safety/system-prompt";
import {
  type VoiceProvider,
  VoiceProviderError,
  type VoiceSessionResponse,
} from "./voice-provider";

const AUTH_TOKENS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/auth_tokens";
const REQUEST_TIMEOUT_MS = 8_000;

/** Gemini expects OpenAPI-style OBJECT/STRING types, not JSON Schema names. */
function toGeminiTools() {
  const upper = (value: string) => value.toUpperCase();

  return [
    {
      functionDeclarations: APPOINTMENT_TOOL_DEFINITIONS.map((tool) => {
        const parameters = tool.parameters as {
          type: string;
          properties: Record<string, Record<string, unknown>>;
          required?: string[];
        };

        return {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: upper(parameters.type),
            properties: Object.fromEntries(
              Object.entries(parameters.properties).map(([key, value]) => [
                key,
                {
                  ...value,
                  type: upper(String(value.type)),
                  ...(Array.isArray(value.enum) ? { enum: value.enum } : {}),
                },
              ]),
            ),
            ...(parameters.required ? { required: parameters.required } : {}),
          },
        };
      }),
    },
  ];
}

export type GeminiLiveAdapterOptions = {
  apiKey: string;
  model: string;
  voice: string;
  fetchFn?: typeof fetch;
  now?: () => number;
};

/**
 * Mints a short-lived Gemini Live token. The master API key never leaves the
 * server: the browser receives only the ephemeral token, and the token itself
 * is locked to this model and to audio-only responses.
 */
export class GeminiLiveAdapter implements VoiceProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly voice: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(options: GeminiLiveAdapterOptions) {
    if (!options.apiKey || options.apiKey.trim().length === 0) {
      throw new VoiceProviderError("gemini-live", "constructor", "API key is required");
    }

    this.apiKey = options.apiKey.trim();
    this.model = options.model;
    this.voice = options.voice;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.now = options.now ?? (() => Date.now());
  }

  async createSession(): Promise<VoiceSessionResponse> {
    const now = this.now();
    const expiresAt = now + GEMINI_TOKEN_TTL_MS;
    const payload = {
      uses: 1,
      expireTime: new Date(expiresAt).toISOString(),
      newSessionExpireTime: new Date(now + GEMINI_TOKEN_START_WINDOW_MS).toISOString(),
      bidiGenerateContentSetup: {
        model: `models/${this.model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } },
          },
        },
        // The token is locked to this setup: the browser's own setup frame is
        // ignored. Keeping the role and the tools here means the client cannot
        // change the assistant's scope or reach tools the clinic did not grant.
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: toGeminiTools(),
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await this.fetchFn(AUTH_TOKENS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch {
      throw new VoiceProviderError("gemini-live", "createSession", "Network request failed");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new VoiceProviderError(
        "gemini-live",
        "createSession",
        "Gemini auth token request failed",
        response.status,
      );
    }

    let data: { name?: unknown };
    try {
      data = (await response.json()) as { name?: unknown };
    } catch {
      throw new VoiceProviderError("gemini-live", "createSession", "Invalid auth token response");
    }

    const token = typeof data?.name === "string" ? data.name.trim() : "";

    if (!token) {
      throw new VoiceProviderError(
        "gemini-live",
        "createSession",
        "Missing auth token name",
        response.status,
      );
    }

    return {
      provider: "gemini-live",
      sessionId: this.model,
      clientSecret: token,
      model: this.model,
      voice: this.voice,
      expiresAt,
    };
  }
}
