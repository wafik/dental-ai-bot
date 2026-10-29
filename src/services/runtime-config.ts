import { getAIConfig, type AIConfig } from "../config/ai";
import { AI_SETTING_KEYS, AI_SETTINGS_DEFAULTS, type AiSettings } from "../domain/admin-settings";
import type { SecretRepository } from "../repository/secret-repository";
import type { SettingsRepository } from "../repository/settings-repository";
import {
  getRuntimeSecretRepository,
  getRuntimeSettingsRepository,
} from "../repository/runtime-repositories";
import { SECRET_KEYS } from "../security/secret-keys";

export type RuntimeConfigDeps = {
  secretRepository?: SecretRepository;
  settingsRepository?: SettingsRepository;
  env?: Record<string, string | undefined>;
};

/**
 * Resolves the AI endpoint: admin-stored setting, then the matching environment
 * variable, then the built-in default. Shared by the admin view and the chat
 * runtime so both always report the same values.
 */
export async function resolveAiSettings(
  settingsRepository: SettingsRepository,
  env: Record<string, string | undefined>,
): Promise<AiSettings> {
  const storedBaseUrl = await settingsRepository.getSetting(AI_SETTING_KEYS.baseUrl);
  const storedModel = await settingsRepository.getSetting(AI_SETTING_KEYS.model);

  return {
    baseUrl:
      storedBaseUrl?.trim() || env[AI_SETTING_KEYS.baseUrl]?.trim() || AI_SETTINGS_DEFAULTS.baseUrl,
    model: storedModel?.trim() || env[AI_SETTING_KEYS.model]?.trim() || AI_SETTINGS_DEFAULTS.model,
  };
}

async function readStoredOpenAiApiKey(secretRepository: SecretRepository): Promise<string | null> {
  const stored = await secretRepository.getSecret(SECRET_KEYS.openaiApiKey);
  const trimmed = stored?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolves the AI configuration used per request. Admin-stored values take
 * precedence over environment variables, which remain the documented
 * bootstrap fallback; built-in defaults fill whatever is still missing.
 */
export async function getRuntimeAiConfig(deps: RuntimeConfigDeps = {}): Promise<AIConfig> {
  const secretRepository = deps.secretRepository ?? getRuntimeSecretRepository();
  const settingsRepository = deps.settingsRepository ?? getRuntimeSettingsRepository();
  const env = deps.env ?? process.env;

  const [storedApiKey, ai] = await Promise.all([
    readStoredOpenAiApiKey(secretRepository),
    resolveAiSettings(settingsRepository, env),
  ]);

  return getAIConfig({
    ...env,
    ...(storedApiKey ? { OPENAI_API_KEY: storedApiKey } : {}),
    OPENAI_BASE_URL: ai.baseUrl,
    OPENAI_MODEL: ai.model,
  });
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
