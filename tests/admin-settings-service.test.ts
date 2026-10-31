import { describe, expect, it } from "bun:test";
import { readAdminSettings, updateAdminSettings } from "../src/services/admin-settings-service";
import { InMemorySettingsRepository } from "../src/repository/in-memory-settings-repository";
import { InMemorySecretRepository } from "../src/repository/in-memory-admin-repositories";
import { CALENDAR_PROVIDER_SETTING } from "../src/domain/admin-settings";
const ENCRYPTION_ENV = { SETTINGS_ENCRYPTION_KEY: "a".repeat(64) };

function makeDeps(env: Record<string, string | undefined> = {}) {
  return {
    settingsRepository: new InMemorySettingsRepository(),
    secretRepository: new InMemorySecretRepository(ENCRYPTION_ENV),
    env,
  };
}

describe("readAdminSettings", () => {
  it("defaults to both providers and exposes three editable mapping rows", async () => {
    const settings = await readAdminSettings(makeDeps());

    expect(settings.calendarProvider).toBe("both");
    expect(settings.dentistMappings).toHaveLength(3);
    expect(settings.dentistMappings.map((row) => row.dentistId)).toEqual([
      "junior",
      "senior-1",
      "senior-2",
    ]);
    for (const row of settings.dentistMappings) {
      expect(row.googleCalendarId).toBe("");
      expect(row.outlookCalendarId).toBe("");
    }
  });

  it("coerces an unknown persisted provider to both", async () => {
    const deps = makeDeps();
    await deps.settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "outllok");

    const settings = await readAdminSettings(deps);
    expect(settings.calendarProvider).toBe("both");
  });

  it("normalizes the legacy single-provider setting to both", async () => {
    const deps = makeDeps();
    await deps.settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "google");

    const settings = await readAdminSettings(deps);
    expect(settings.calendarProvider).toBe("both");
  });

  it("keeps an explicit none setting", async () => {
    const deps = makeDeps();
    await deps.settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "none");

    const settings = await readAdminSettings(deps);
    expect(settings.calendarProvider).toBe("none");
  });

  it("echoes every known secret key as unconfigured metadata", async () => {
    const settings = await readAdminSettings(makeDeps());

    expect(settings.secrets["openai.apiKey"]).toEqual({ isConfigured: false });
    expect(settings.secrets["microsoft.refreshToken"]).toEqual({ isConfigured: false });
  });

  it("returns both provider calendar IDs per dentist and only active mappings", async () => {
    const deps = makeDeps();
    await deps.settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "outlook");
    await deps.settingsRepository.upsertDentistCalendarMapping({
      dentistId: "junior",
      provider: "outlook",
      calendarId: "outlook-junior",
    });
    await deps.settingsRepository.upsertDentistCalendarMapping({
      dentistId: "junior",
      provider: "google",
      calendarId: "google-junior",
    });

    const settings = await readAdminSettings(deps);
    expect(settings.calendarProvider).toBe("both");
    expect(settings.dentistMappings[0]).toMatchObject({
      dentistId: "junior",
      googleCalendarId: "google-junior",
      outlookCalendarId: "outlook-junior",
    });
    expect(settings.dentistMappings).toHaveLength(3);
  });

  it("falls back to the environment AI endpoint, then the built-in default", async () => {
    const fromEnv = await readAdminSettings(
      makeDeps({ OPENAI_BASE_URL: "https://proxy.test/v1", OPENAI_MODEL: "custom-model" }),
    );
    expect(fromEnv.ai).toEqual({ baseUrl: "https://proxy.test/v1", model: "custom-model" });

    const defaults = await readAdminSettings(makeDeps());
    expect(defaults.ai).toEqual({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    });
  });

  it("prefers the stored AI endpoint over the environment", async () => {
    const deps = makeDeps({ OPENAI_BASE_URL: "https://env.test/v1" });
    await deps.settingsRepository.setSetting("OPENAI_BASE_URL", "https://stored.test/v1");
    await deps.settingsRepository.setSetting("OPENAI_MODEL", "stored-model");

    const settings = await readAdminSettings(deps);
    expect(settings.ai).toEqual({ baseUrl: "https://stored.test/v1", model: "stored-model" });
  });
});

describe("updateAdminSettings", () => {
  it("persists the provider and both mappings per dentist, then returns the refreshed view", async () => {
    const deps = makeDeps();

    const result = await updateAdminSettings(deps, {
      calendarProvider: "both",
      dentistMappings: [
        {
          dentistId: "junior",
          googleCalendarId: "g-junior",
          outlookCalendarId: "o-junior",
        },
        {
          dentistId: "senior-1",
          googleCalendarId: "g-senior-1",
          outlookCalendarId: "",
        },
      ],
    });

    expect(await deps.settingsRepository.getSetting(CALENDAR_PROVIDER_SETTING)).toBe("both");
    expect(result.calendarProvider).toBe("both");
    expect(result.dentistMappings[0]!.googleCalendarId).toBe("g-junior");
    expect(result.dentistMappings[0]!.outlookCalendarId).toBe("o-junior");
    expect(result.dentistMappings[1]!.googleCalendarId).toBe("g-senior-1");
    expect(result.dentistMappings[1]!.outlookCalendarId).toBe("");
    expect(result.dentistMappings[2]!.googleCalendarId).toBe("");
  });

  it("persists the AI endpoint and echoes it back", async () => {
    const deps = makeDeps();

    const result = await updateAdminSettings(deps, {
      calendarProvider: "none",
      dentistMappings: [],
      ai: { baseUrl: "https://proxy.internal/v1", model: "deepseek-chat" },
    });

    expect(result.ai).toEqual({ baseUrl: "https://proxy.internal/v1", model: "deepseek-chat" });
    expect(await deps.settingsRepository.getSetting("OPENAI_BASE_URL")).toBe(
      "https://proxy.internal/v1",
    );
  });

  it("leaves the stored AI endpoint alone when the field is omitted", async () => {
    const deps = makeDeps();
    await deps.settingsRepository.setSetting("OPENAI_MODEL", "kept-model");

    const result = await updateAdminSettings(deps, {
      calendarProvider: "none",
      dentistMappings: [],
    });

    expect(result.ai.model).toBe("kept-model");
  });

  it("stores non-empty secrets and reports them as configured without plaintext", async () => {
    const deps = makeDeps();

    const result = await updateAdminSettings(deps, {
      calendarProvider: "none",
      dentistMappings: [],
      secrets: { "openai.apiKey": "sk-super-secret" },
    });

    expect(result.secrets["openai.apiKey"]?.isConfigured).toBe(true);
    expect(JSON.stringify(result)).not.toContain("sk-super-secret");
    expect(await deps.secretRepository.getSecret("openai.apiKey")).toBe("sk-super-secret");
  });

  it("preserves an existing secret when the submitted value is blank", async () => {
    const deps = makeDeps();
    await deps.secretRepository.setSecret("openai.apiKey", "sk-existing");

    const result = await updateAdminSettings(deps, {
      calendarProvider: "none",
      dentistMappings: [],
      secrets: { "openai.apiKey": "   " },
    });

    expect(result.secrets["openai.apiKey"]?.isConfigured).toBe(true);
    expect(await deps.secretRepository.getSecret("openai.apiKey")).toBe("sk-existing");
  });

  it("ignores unknown secret keys", async () => {
    const deps = makeDeps();

    const result = await updateAdminSettings(deps, {
      calendarProvider: "none",
      dentistMappings: [],
      secrets: { "unknown.key": "value", "openai.apiKey": "sk-real" },
    });

    expect(result.secrets["unknown.key"]).toBeUndefined();
    expect(await deps.secretRepository.getSecret("unknown.key")).toBeNull();
    expect(await deps.secretRepository.getSecret("openai.apiKey")).toBe("sk-real");
  });

  it("trims submitted secret values before storing", async () => {
    const deps = makeDeps();

    await updateAdminSettings(deps, {
      calendarProvider: "none",
      dentistMappings: [],
      secrets: { "google.clientSecret": "  gocspx-value  " },
    });

    expect(await deps.secretRepository.getSecret("google.clientSecret")).toBe("gocspx-value");
  });
});
