import { TTSProviderError } from "../providers/tts/tts-provider";

export type TTSConfig = {
  baseUrl: string;
  voice: string;
};

export function getTTSConfig(env: Record<string, string | undefined> = process.env): TTSConfig {
  const rawBaseUrl = env.KOKORO_TTS_BASE_URL?.trim();
  if (!rawBaseUrl) {
    throw new TTSProviderError("kokoro", "configuration");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawBaseUrl);
  } catch {
    throw new TTSProviderError("kokoro", "configuration");
  }

  if (
    (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
    (parsedUrl.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname)) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new TTSProviderError("kokoro", "configuration");
  }

  const voice = env.KOKORO_TTS_VOICE?.trim() || "af_heart";
  if (voice.length > 64) {
    throw new TTSProviderError("kokoro", "configuration");
  }

  return { baseUrl: parsedUrl.toString().replace(/\/+$/, ""), voice };
}
