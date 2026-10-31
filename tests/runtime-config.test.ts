import { beforeEach, describe, expect, it } from "bun:test";
import { getRuntimeAiConfig, getRuntimeOpenAiApiKey } from "@/services/runtime-config";
import {
  getRuntimeCalendarProvider,
  resetCalendarProviderCache,
} from "@/services/calendar-provider-cache";
import { GoogleCalendarAdapter } from "@/providers/calendar/google-calendar-adapter";
import { OutlookCalendarAdapter } from "@/providers/calendar/outlook-calendar-adapter";
import { InMemorySettingsRepository } from "@/repository/in-memory-settings-repository";
import { InMemorySecretRepository } from "@/repository/in-memory-admin-repositories";
import type { SecretMetadata, SecretRepository } from "@/repository/secret-repository";
import { CALENDAR_PROVIDER_SETTING } from "@/domain/admin-settings";
import { SECRET_KEYS } from "@/security/secret-keys";

const ENCRYPTION_ENV = { SETTINGS_ENCRYPTION_KEY: "a".repeat(64) };

const CALENDAR_ENV = {
  CALENDAR_PROVIDER: "both",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_REFRESH_TOKEN: "refresh-token",
  MICROSOFT_TENANT_ID: "tenant-id",
  MICROSOFT_CLIENT_ID: "microsoft-client-id",
  MICROSOFT_CLIENT_SECRET: "microsoft-client-secret",
  MICROSOFT_REFRESH_TOKEN: "microsoft-refresh-token",
};

async function seedCalendarSettings(settingsRepository: InMemorySettingsRepository): Promise<void> {
  await settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "both");
  for (const provider of ["google", "outlook"] as const) {
    for (const dentistId of ["junior", "senior-1", "senior-2"] as const) {
      await settingsRepository.upsertDentistCalendarMapping({
        dentistId,
        provider,
        calendarId: `${dentistId}@${provider}.example`,
      });
    }
  }
}

describe("getRuntimeAiConfig", () => {
  it("prefers the database-stored OpenAI key over the environment", async () => {
    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(SECRET_KEYS.openaiApiKey, "sk-database");

    const config = await getRuntimeAiConfig({
      secretRepository,
      settingsRepository: new InMemorySettingsRepository(),
      env: {
        OPENAI_API_KEY: "sk-environment",
        OPENAI_BASE_URL: "https://example.test/v1",
        OPENAI_MODEL: "custom-model",
      },
    });

    expect(config.apiKey).toBe("sk-database");
    expect(config.baseUrl).toBe("https://example.test/v1");
    expect(config.model).toBe("custom-model");
  });

  it("prefers the admin-stored endpoint and model over the environment", async () => {
    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(SECRET_KEYS.openaiApiKey, "sk-database");
    const settingsRepository = new InMemorySettingsRepository();
    await settingsRepository.setSetting("OPENAI_BASE_URL", "https://stored.test/v1");
    await settingsRepository.setSetting("OPENAI_MODEL", "stored-model");

    const config = await getRuntimeAiConfig({
      secretRepository,
      settingsRepository,
      env: { OPENAI_BASE_URL: "https://env.test/v1", OPENAI_MODEL: "env-model" },
    });

    expect(config.baseUrl).toBe("https://stored.test/v1");
    expect(config.model).toBe("stored-model");
  });

  it("falls back to the environment when no database key is stored", async () => {
    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);

    const config = await getRuntimeAiConfig({
      secretRepository,
      settingsRepository: new InMemorySettingsRepository(),
      env: { OPENAI_API_KEY: "sk-environment" },
    });

    expect(config.apiKey).toBe("sk-environment");
    expect(config.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.model).toBe("gpt-4o-mini");
  });

  it("treats a blank stored secret as absent", async () => {
    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(SECRET_KEYS.openaiApiKey, "   ");

    const config = await getRuntimeAiConfig({
      secretRepository,
      settingsRepository: new InMemorySettingsRepository(),
      env: { OPENAI_API_KEY: "sk-environment" },
    });

    expect(config.apiKey).toBe("sk-environment");
  });

  it("throws when neither the database nor the environment has a key", async () => {
    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);

    await expect(
      getRuntimeAiConfig({
        secretRepository,
        settingsRepository: new InMemorySettingsRepository(),
        env: {},
      }),
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });
});

describe("getRuntimeOpenAiApiKey", () => {
  it("returns the database key when configured", async () => {
    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(SECRET_KEYS.openaiApiKey, "sk-database");

    await expect(
      getRuntimeOpenAiApiKey({ secretRepository, env: { OPENAI_API_KEY: "sk-environment" } }),
    ).resolves.toBe("sk-database");
  });

  it("falls back to the environment key", async () => {
    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);

    await expect(
      getRuntimeOpenAiApiKey({ secretRepository, env: { OPENAI_API_KEY: "sk-environment" } }),
    ).resolves.toBe("sk-environment");
  });

  it("throws a generic error when no key exists anywhere", async () => {
    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);

    await expect(getRuntimeOpenAiApiKey({ secretRepository, env: {} })).rejects.toThrow(
      "OpenAI API key is not configured.",
    );
  });
});

/**
 * Secret repository with a controllable metadata timestamp so the cache
 * fingerprint can be changed deterministically.
 */
class FakeSecretRepository implements SecretRepository {
  resolvedCredentials = 0;
  metadataReads = 0;
  updatedAt: string | undefined = "2026-10-26T00:00:00.000Z";

  async getSecret(key: string): Promise<string | null> {
    if (key === SECRET_KEYS.googleClientSecret) {
      this.resolvedCredentials += 1;
      return "db-client-secret";
    }
    return null;
  }

  async setSecret(): Promise<void> {
    // Not needed for cache tests.
  }

  async getMetadata(keys: readonly string[]): Promise<Record<string, SecretMetadata>> {
    this.metadataReads += 1;
    const result: Record<string, SecretMetadata> = {};
    for (const key of keys) {
      result[key] =
        key === SECRET_KEYS.googleClientSecret && this.updatedAt
          ? { key, isConfigured: true, updatedAt: this.updatedAt }
          : { key, isConfigured: false };
    }
    return result;
  }
}

describe("getRuntimeCalendarProvider cache", () => {
  beforeEach(() => {
    resetCalendarProviderCache();
  });

  it("reuses the resolved providers while the fingerprint is unchanged", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedCalendarSettings(settingsRepository);
    const secretRepository = new FakeSecretRepository();

    const first = await getRuntimeCalendarProvider({
      settingsRepository,
      secretRepository,
      env: CALENDAR_ENV,
    });
    const second = await getRuntimeCalendarProvider({
      settingsRepository,
      secretRepository,
      env: CALENDAR_ENV,
    });
    const third = await getRuntimeCalendarProvider({
      settingsRepository,
      secretRepository,
      env: CALENDAR_ENV,
    });

    expect(first.google).toBeInstanceOf(GoogleCalendarAdapter);
    expect(first.outlook).toBeInstanceOf(OutlookCalendarAdapter);
    expect(second).toBe(first);
    expect(third).toBe(first);
    // Fingerprint is always checked, but credentials are only read on resolution.
    expect(secretRepository.metadataReads).toBe(3);
    expect(secretRepository.resolvedCredentials).toBe(1);
  });

  it("re-resolves after a stored secret is updated", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedCalendarSettings(settingsRepository);
    const secretRepository = new FakeSecretRepository();

    const first = await getRuntimeCalendarProvider({
      settingsRepository,
      secretRepository,
      env: CALENDAR_ENV,
    });

    secretRepository.updatedAt = "2026-10-26T01:00:00.000Z";

    const second = await getRuntimeCalendarProvider({
      settingsRepository,
      secretRepository,
      env: CALENDAR_ENV,
    });

    expect(second).not.toBe(first);
    expect(second.google).toBeInstanceOf(GoogleCalendarAdapter);
    expect(secretRepository.resolvedCredentials).toBe(2);
  });

  it("re-resolves after a mapping changes", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedCalendarSettings(settingsRepository);
    const secretRepository = new FakeSecretRepository();

    const first = await getRuntimeCalendarProvider({
      settingsRepository,
      secretRepository,
      env: CALENDAR_ENV,
    });

    await settingsRepository.upsertDentistCalendarMapping({
      dentistId: "junior",
      provider: "google",
      calendarId: "junior-updated@calendar.google.com",
    });

    const second = await getRuntimeCalendarProvider({
      settingsRepository,
      secretRepository,
      env: CALENDAR_ENV,
    });

    expect(second).not.toBe(first);
  });

  it("re-resolves to local-only mode after the provider setting changes", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedCalendarSettings(settingsRepository);
    const secretRepository = new FakeSecretRepository();

    const first = await getRuntimeCalendarProvider({
      settingsRepository,
      secretRepository,
      env: CALENDAR_ENV,
    });

    await settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "none");

    const second = await getRuntimeCalendarProvider({
      settingsRepository,
      secretRepository,
      env: CALENDAR_ENV,
    });

    expect(first.google).toBeInstanceOf(GoogleCalendarAdapter);
    expect(second).toEqual({});
  });

  it("does not cache a failed resolution", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedCalendarSettings(settingsRepository);
    const secretRepository = new FakeSecretRepository();

    const originalGetSecret = secretRepository.getSecret.bind(secretRepository);
    let attempts = 0;
    secretRepository.getSecret = async (key: string) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("secret store unavailable");
      }
      return originalGetSecret(key);
    };

    await expect(
      getRuntimeCalendarProvider({
        settingsRepository,
        secretRepository,
        env: CALENDAR_ENV,
      }),
    ).rejects.toThrow("secret store unavailable");

    const providers = await getRuntimeCalendarProvider({
      settingsRepository,
      secretRepository,
      env: CALENDAR_ENV,
    });

    expect(providers.google).toBeInstanceOf(GoogleCalendarAdapter);
  });
});
