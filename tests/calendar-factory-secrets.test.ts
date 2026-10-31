import { describe, expect, it } from "bun:test";
import { resolveCalendarProvider } from "@/providers/calendar/calendar-factory";
import { GoogleCalendarAdapter } from "@/providers/calendar/google-calendar-adapter";
import { OutlookCalendarAdapter } from "@/providers/calendar/outlook-calendar-adapter";
import { InMemorySettingsRepository } from "@/repository/in-memory-settings-repository";
import { InMemorySecretRepository } from "@/repository/in-memory-admin-repositories";
import { CALENDAR_PROVIDER_SETTING } from "@/domain/admin-settings";
import { SECRET_KEYS } from "@/security/secret-keys";

const ENCRYPTION_ENV = { SETTINGS_ENCRYPTION_KEY: "a".repeat(64) };

const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: "env-client-id",
  GOOGLE_CLIENT_SECRET: "env-secret",
  GOOGLE_REFRESH_TOKEN: "env-refresh-token",
};

const MICROSOFT_ENV = {
  MICROSOFT_TENANT_ID: "env-tenant",
  MICROSOFT_CLIENT_ID: "env-ms-client",
  MICROSOFT_CLIENT_SECRET: "env-ms-secret",
  MICROSOFT_REFRESH_TOKEN: "env-ms-refresh",
};

const FULL_ENV = { ...GOOGLE_ENV, ...MICROSOFT_ENV };

type GoogleConfigView = {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  serviceAccountEmail?: string;
  privateKey?: string;
  calendarIds: { junior: string; "senior-1": string; "senior-2": string };
};

type OutlookConfigView = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarIds: { junior: string; "senior-1": string; "senior-2": string };
};

/**
 * The adapters keep their validated configuration private. Reading it through a
 * structural view proves which credential value the factory actually passed
 * without exposing anything at runtime.
 */
function googleConfig(provider: GoogleCalendarAdapter): GoogleConfigView {
  return (provider as unknown as { config: GoogleConfigView }).config;
}

function outlookConfig(provider: OutlookCalendarAdapter): OutlookConfigView {
  return (provider as unknown as { config: OutlookConfigView }).config;
}

/** The factory is fail-closed, so every credential test seeds both providers. */
async function seedBothProviders(settingsRepository: InMemorySettingsRepository): Promise<void> {
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

async function resolveGoogle(
  settingsRepository: InMemorySettingsRepository,
  secretRepository: InMemorySecretRepository,
  env: Record<string, string | undefined>,
): Promise<GoogleCalendarAdapter> {
  const providers = await resolveCalendarProvider({ settingsRepository, secretRepository, env });
  return providers.google as GoogleCalendarAdapter;
}

describe("Calendar factory credential resolution", () => {
  it("prefers a database-stored Google client secret over the environment", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedBothProviders(settingsRepository);

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(SECRET_KEYS.googleClientSecret, "db-google-secret");

    const config = googleConfig(
      await resolveGoogle(settingsRepository, secretRepository, FULL_ENV),
    );
    expect(config.clientSecret).toBe("db-google-secret");
    // Environment values still supply fields the database does not override.
    expect(config.clientId).toBe("env-client-id");
    expect(config.refreshToken).toBe("env-refresh-token");
  });

  it("uses environment credentials when the database has no stored secret", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedBothProviders(settingsRepository);

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);

    const config = googleConfig(
      await resolveGoogle(settingsRepository, secretRepository, FULL_ENV),
    );
    expect(config.clientSecret).toBe("env-secret");
  });

  it("treats a blank database secret as absent and falls back to the environment", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedBothProviders(settingsRepository);

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(SECRET_KEYS.googleClientSecret, "   ");

    const config = googleConfig(
      await resolveGoogle(settingsRepository, secretRepository, FULL_ENV),
    );
    expect(config.clientSecret).toBe("env-secret");
  });

  it("prefers database-stored Microsoft credentials over the environment", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedBothProviders(settingsRepository);

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(SECRET_KEYS.microsoftClientSecret, "db-ms-secret");
    await secretRepository.setSecret(SECRET_KEYS.microsoftRefreshToken, "db-ms-refresh");

    const providers = await resolveCalendarProvider({
      settingsRepository,
      secretRepository,
      env: FULL_ENV,
    });

    const config = outlookConfig(providers.outlook as OutlookCalendarAdapter);
    expect(config.clientSecret).toBe("db-ms-secret");
    expect(config.refreshToken).toBe("db-ms-refresh");
    expect(config.tenantId).toBe("env-tenant");
  });

  it("throws instead of returning a mock when providers are unconfigured", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "both");

    await expect(
      resolveCalendarProvider({
        settingsRepository,
        secretRepository: new InMemorySecretRepository(ENCRYPTION_ENV),
        env: {},
      }),
    ).rejects.toThrow("Both Google Calendar and Outlook must be configured");
  });

  it("returns an empty provider set when the database disables external calendars", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedBothProviders(settingsRepository);
    await settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "none");

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(SECRET_KEYS.googleClientSecret, "db-google-secret");

    const providers = await resolveCalendarProvider({
      settingsRepository,
      secretRepository,
      env: { ...FULL_ENV, CALENDAR_PROVIDER: "both" },
    });

    expect(providers).toEqual({});
  });

  it("builds a service-account adapter from stored secrets without delegated OAuth", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedBothProviders(settingsRepository);

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(
      SECRET_KEYS.googleServiceAccountEmail,
      "dentist@project.iam.gserviceaccount.com",
    );
    await secretRepository.setSecret(
      SECRET_KEYS.googleServiceAccountPrivateKey,
      "-----BEGIN PRIVATE KEY-----\\nabc",
    );

    const config = googleConfig(
      await resolveGoogle(settingsRepository, secretRepository, MICROSOFT_ENV),
    );
    expect(config.serviceAccountEmail).toBe("dentist@project.iam.gserviceaccount.com");
    expect(config.privateKey).toBe("-----BEGIN PRIVATE KEY-----\nabc");
  });

  it("prefers service-account auth over delegated OAuth when both are available", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedBothProviders(settingsRepository);

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(
      SECRET_KEYS.googleServiceAccountEmail,
      "dentist@project.iam.gserviceaccount.com",
    );
    await secretRepository.setSecret(
      SECRET_KEYS.googleServiceAccountPrivateKey,
      "-----BEGIN PRIVATE KEY-----\\nabc",
    );

    const config = googleConfig(
      await resolveGoogle(settingsRepository, secretRepository, FULL_ENV),
    );
    expect(config.serviceAccountEmail).toBe("dentist@project.iam.gserviceaccount.com");
    expect(config.clientId).toBeUndefined();
  });
});
