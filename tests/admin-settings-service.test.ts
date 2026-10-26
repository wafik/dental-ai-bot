import { describe, expect, it } from "bun:test";
import { readAdminSettings, updateAdminSettings } from "../src/services/admin-settings-service";
import { InMemorySettingsRepository } from "../src/repository/in-memory-settings-repository";
import { InMemorySecretRepository } from "../src/repository/in-memory-admin-repositories";
import { CALENDAR_PROVIDER_SETTING } from "../src/domain/admin-settings";

const ENCRYPTION_ENV = { SETTINGS_ENCRYPTION_KEY: "a".repeat(64) };

function makeDeps() {
  return {
    settingsRepository: new InMemorySettingsRepository(),
    secretRepository: new InMemorySecretRepository(ENCRYPTION_ENV),
  };
}

describe("readAdminSettings", () => {
  it("defaults to provider none and exposes three editable mapping rows", async () => {
    const settings = await readAdminSettings(makeDeps());

    expect(settings.calendarProvider).toBe("none");
    expect(settings.dentistMappings).toHaveLength(3);
    expect(settings.dentistMappings.map((row) => row.dentistId)).toEqual([
      "junior",
      "senior-1",
      "senior-2",
    ]);
    for (const row of settings.dentistMappings) {
      expect(row.calendarId).toBe("");
      expect(row.provider).toBe("google");
      expect(row.isActive).toBe(true);
    }
  });

  it("coerces an unknown persisted provider to none", async () => {
    const deps = makeDeps();
    await deps.settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "outllok");

    const settings = await readAdminSettings(deps);
    expect(settings.calendarProvider).toBe("none");
  });

  it("echoes every known secret key as unconfigured metadata", async () => {
    const settings = await readAdminSettings(makeDeps());

    expect(settings.secrets["openai.apiKey"]).toEqual({ isConfigured: false });
    expect(settings.secrets["microsoft.refreshToken"]).toEqual({ isConfigured: false });
  });

  it("returns only supported provider mappings with all three dentists present", async () => {
    const deps = makeDeps();
    await deps.settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "outlook");
    await deps.settingsRepository.upsertDentistCalendarMapping({
      dentistId: "junior",
      provider: "outlook",
      calendarId: "outlook-junior",
    });

    const settings = await readAdminSettings(deps);
    expect(settings.calendarProvider).toBe("outlook");
    expect(settings.dentistMappings[0]).toMatchObject({
      dentistId: "junior",
      provider: "outlook",
      calendarId: "outlook-junior",
    });
    expect(settings.dentistMappings).toHaveLength(3);
  });
});

describe("updateAdminSettings", () => {
  it("persists the provider and mapping rows, then returns the refreshed view", async () => {
    const deps = makeDeps();

    const result = await updateAdminSettings(deps, {
      calendarProvider: "google",
      dentistMappings: [
        { dentistId: "junior", provider: "google", calendarId: "cal-junior" },
        { dentistId: "senior-1", provider: "google", calendarId: "cal-senior-1" },
      ],
    });

    expect(await deps.settingsRepository.getSetting(CALENDAR_PROVIDER_SETTING)).toBe("google");
    expect(result.calendarProvider).toBe("google");
    expect(result.dentistMappings[0]!.calendarId).toBe("cal-junior");
    expect(result.dentistMappings[1]!.calendarId).toBe("cal-senior-1");
    expect(result.dentistMappings[2]!.calendarId).toBe("");
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
