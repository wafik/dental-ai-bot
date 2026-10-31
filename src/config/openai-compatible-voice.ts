export type OpenAICompatibleVoiceConfig = {
  url: string;
  model: string;
};

export const OPENAI_COMPATIBLE_VOICE_DEFAULTS = {
  model: "gpt-realtime",
} as const;

const MODEL_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Resolves the OpenAI-compatible realtime endpoint. The URL is required and must
 * be a WebSocket endpoint; the browser connects to it directly, so it has to be
 * reachable from the patient's device.
 */
export function getOpenAICompatibleVoiceConfig(
  env: Record<string, string | undefined> = process.env,
): OpenAICompatibleVoiceConfig {
  const rawUrl = (env.OPENAI_COMPATIBLE_VOICE_URL ?? "").trim();

  if (!rawUrl) {
    throw new Error("Missing required environment variable: OPENAI_COMPATIBLE_VOICE_URL");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("OPENAI_COMPATIBLE_VOICE_URL is invalid");
  }

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error("OPENAI_COMPATIBLE_VOICE_URL must use ws:// or wss://");
  }

  const model =
    (env.OPENAI_COMPATIBLE_VOICE_MODEL ?? "").trim() || OPENAI_COMPATIBLE_VOICE_DEFAULTS.model;

  if (!MODEL_PATTERN.test(model)) {
    throw new Error("OPENAI_COMPATIBLE_VOICE_MODEL is invalid");
  }

  return { url: parsed.toString(), model };
}
