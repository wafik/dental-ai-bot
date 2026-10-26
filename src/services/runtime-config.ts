import { getAIConfig, type AIConfig } from "../config/ai";
import type { SecretRepository } from "../repository/secret-repository";
import { getRuntimeSecretRepository } from "../repository/runtime-repositories";
import { SECRET_KEYS } from "../security/secret-keys";

export type RuntimeConfigDeps = {
  secretRepository?: SecretRepository;
  env?: Record<string, string | undefined>;
};

async function readStoredOpenAiApiKey(secretRepository: SecretRepository): Promise<string | null> {
  const stored = await secretRepository.getSecret(SECRET_KEYS.openaiApiKey);
  const trimmed = stored?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolves the AI configuration used per request. A database-stored API key
 * takes precedence; environment values remain a documented bootstrap fallback
 * and supply the base URL and model defaults.
 */
export async function getRuntimeAiConfig(deps: RuntimeConfigDeps = {}): Promise<AIConfig> {
  const secretRepository = deps.secretRepository ?? getRuntimeSecretRepository();
  const env = deps.env ?? process.env;

  const storedApiKey = await readStoredOpenAiApiKey(secretRepository);
  return getAIConfig(storedApiKey ? { ...env, OPENAI_API_KEY: storedApiKey } : env);
}

/**
 * Returns the OpenAI API key from the secret store first, then the
 * environment. Throws a generic error when neither source is configured.
 */
export async function getRuntimeOpenAiApiKey(deps: RuntimeConfigDeps = {}): Promise<string> {
  const secretRepository = deps.secretRepository ?? getRuntimeSecretRepository();
  const env = deps.env ?? process.env;

  const storedApiKey = await readStoredOpenAiApiKey(secretRepository);
  if (storedApiKey) {
    return storedApiKey;
  }

  const envApiKey = env.OPENAI_API_KEY?.trim();
  if (envApiKey) {
    return envApiKey;
  }

  throw new Error("OpenAI API key is not configured.");
}
