export type AIConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

/**
 * Returns validated AI configuration from environment variables.
 * Throws an error if OPENAI_API_KEY is missing or empty.
 */
export function getAIConfig(env: Record<string, string | undefined> = process.env): AIConfig {
  const rawApiKey = env.OPENAI_API_KEY;
  const apiKey = rawApiKey?.trim();

  if (!apiKey) {
    throw new Error("Missing required environment variable: OPENAI_API_KEY");
  }

  const rawBaseUrl = env.OPENAI_BASE_URL?.trim();
  const rawModel = env.OPENAI_MODEL?.trim();

  return {
    apiKey,
    baseUrl: rawBaseUrl || "https://api.openai.com/v1",
    model: rawModel || "gpt-4o-mini",
  };
}
