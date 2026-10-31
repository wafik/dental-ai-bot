export type GeminiLiveConfig = {
  apiKey: string;
  model: string;
  voice: string;
};

export const GEMINI_LIVE_DEFAULTS = {
  model: "gemini-2.5-flash-native-audio-latest",
  voice: "Aoede",
} as const;

/** Ephemeral tokens live for 30 minutes; the browser must start within one. */
export const GEMINI_TOKEN_TTL_MS = 30 * 60 * 1000;
export const GEMINI_TOKEN_START_WINDOW_MS = 60 * 1000;

const MODEL_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const VOICE_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

/**
 * Resolves the Gemini Live voice configuration. The API key is required; model
 * and voice fall back to documented defaults.
 */
export function getGeminiLiveConfig(
  env: Record<string, string | undefined> = process.env,
): GeminiLiveConfig {
  const rawApiKey = env.GEMINI_API_KEY;

  if (!rawApiKey) {
    throw new Error("Missing required environment variable: GEMINI_API_KEY");
  }

  const apiKey = rawApiKey.trim();

  if (!apiKey) {
    throw new Error("Missing required environment variable: GEMINI_API_KEY");
  }

  const model = (env.GEMINI_LIVE_MODEL ?? "").trim() || GEMINI_LIVE_DEFAULTS.model;
  const voice = (env.GEMINI_LIVE_VOICE ?? "").trim() || GEMINI_LIVE_DEFAULTS.voice;

  if (!MODEL_PATTERN.test(model)) {
    throw new Error("GEMINI_LIVE_MODEL is invalid");
  }

  if (!VOICE_PATTERN.test(voice)) {
    throw new Error("GEMINI_LIVE_VOICE is invalid");
  }

  return { apiKey, model, voice };
}
