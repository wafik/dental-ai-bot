import { describe, expect, it } from "bun:test";
import { resolveCalendarProvider } from "@/providers/calendar/calendar-factory";
import { NoopCalendarProvider } from "@/providers/calendar/noop-calendar-provider";
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

type GoogleConfigView = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
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

async function seedGoogleMappings(settingsRepository: InMemorySettingsRepository): Promise<void> {
  await settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "google");
  await settingsRepository.upsertDentistCalendarMapping({
    dentistId: "junior",
    provider: "google",
    calendarId: "junior@calendar.google.com",
  });
  await settingsRepository.upsertDentistCalendarMapping({
    dentistId: "senior-1",
    provider: "google",
    calendarId: "senior1@calendar.google.com",
  });
  await settingsRepository.upsertDentistCalendarMapping({
    dentistId: "senior-2",
    provider: "google",
    calendarId: "senior2@calendar.google.com",
  });
}

async function seedOutlookMappings(settingsRepository: InMemorySettingsRepository): Promise<void> {
  await settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "outlook");
  for (const dentistId of ["junior", "senior-1", "senior-2"] as const) {
    await settingsRepository.upsertDentistCalendarMapping({
      dentistId,
      provider: "outlook",
      calendarId: `${dentistId}@clinic.onmicrosoft.com`,
    });
  }
}

describe("Calendar factory credential resolution", () => {
  it("prefers a database-stored Google client secret over the environment", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedGoogleMappings(settingsRepository);

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(SECRET_KEYS.googleClientSecret, "db-google-secret");

    const provider = await resolveCalendarProvider({
      settingsRepository,
      secretRepository,
      env: GOOGLE_ENV,
    });

    expect(provider).toBeInstanceOf(GoogleCalendarAdapter);
    const config = googleConfig(provider as GoogleCalendarAdapter);
    expect(config.clientSecret).toBe("db-google-secret");
    // Environment values still supply fields the database does not override.
    expect(config.clientId).toBe("env-client-id");
    expect(config.refreshToken).toBe("env-refresh-token");
  });

  it("uses environment credentials when the database has no stored secret", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedGoogleMappings(settingsRepository);

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);

    const provider = await resolveCalendarProvider({
      settingsRepository,
      secretRepository,
      env: GOOGLE_ENV,
    });

    expect(provider).toBeInstanceOf(GoogleCalendarAdapter);
    expect(googleConfig(provider as GoogleCalendarAdapter).clientSecret).toBe("env-secret");
  });

  it("treats a blank database secret as absent and falls back to the environment", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedGoogleMappings(settingsRepository);

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(SECRET_KEYS.googleClientSecret, "   ");

    const provider = await resolveCalendarProvider({
      settingsRepository,
      secretRepository,
      env: GOOGLE_ENV,
    });

    expect(provider).toBeInstanceOf(GoogleCalendarAdapter);
    expect(googleConfig(provider as GoogleCalendarAdapter).clientSecret).toBe("env-secret");
  });

  it("prefers database-stored Microsoft credentials over the environment", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedOutlookMappings(settingsRepository);

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(SECRET_KEYS.microsoftClientSecret, "db-ms-secret");
    await secretRepository.setSecret(SECRET_KEYS.microsoftRefreshToken, "db-ms-refresh");

    const provider = await resolveCalendarProvider({
      settingsRepository,
      secretRepository,
      env: {
        MICROSOFT_TENANT_ID: "env-tenant",
        MICROSOFT_CLIENT_ID: "env-ms-client",
        MICROSOFT_CLIENT_SECRET: "env-ms-secret",
        MICROSOFT_REFRESH_TOKEN: "env-ms-refresh",
      },
    });

    expect(provider).toBeInstanceOf(OutlookCalendarAdapter);
    const config = outlookConfig(provider as OutlookCalendarAdapter);
    expect(config.clientSecret).toBe("db-ms-secret");
    expect(config.refreshToken).toBe("db-ms-refresh");
    expect(config.tenantId).toBe("env-tenant");
  });

  it("returns NoopCalendarProvider when neither database nor environment is configured", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "google");
    await settingsRepository.upsertDentistCalendarMapping({
      dentistId: "junior",
      provider: "google",
      calendarId: "junior@calendar.google.com",
    });
    await settingsRepository.upsertDentistCalendarMapping({
      dentistId: "senior-1",
      provider: "google",
      calendarId: "senior1@calendar.google.com",
    });
    await settingsRepository.upsertDentistCalendarMapping({
      dentistId: "senior-2",
      provider: "google",
      calendarId: "senior2@calendar.google.com",
    });

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);

    const provider = await resolveCalendarProvider({
      settingsRepository,
      secretRepository,
      env: {},
    });

    expect(provider).toBeInstanceOf(NoopCalendarProvider);
  });

  it("uses the database provider setting over the environment setting", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedGoogleMappings(settingsRepository);

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);

    const provider = await resolveCalendarProvider({
      settingsRepository,
      secretRepository,
      env: { ...GOOGLE_ENV, CALENDAR_PROVIDER: "outlook" },
    });

    expect(provider).toBeInstanceOf(GoogleCalendarAdapter);
  });

  it("returns NoopCalendarProvider when the database disables external calendars", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedGoogleMappings(settingsRepository);
    await settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, "none");

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(SECRET_KEYS.googleClientSecret, "db-google-secret");

    const provider = await resolveCalendarProvider({
      settingsRepository,
      secretRepository,
      env: { ...GOOGLE_ENV, CALENDAR_PROVIDER: "google" },
    });

    expect(provider).toBeInstanceOf(NoopCalendarProvider);
  });

  it("builds a service-account adapter from stored secrets without delegated OAuth", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedGoogleMappings(settingsRepository);

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(
      SECRET_KEYS.googleServiceAccountEmail,
      "dentist@project.iam.gserviceaccount.com",
    );
    await secretRepository.setSecret(
      SECRET_KEYS.googleServiceAccountPrivateKey,
      "-----BEGIN PRIVATE KEY-----\\nabc",
    );

    const provider = await resolveCalendarProvider({
      settingsRepository,
      secretRepository,
      env: {},
    });

    expect(provider).toBeInstanceOf(GoogleCalendarAdapter);
    const config = (
      provider as unknown as { config: { serviceAccountEmail?: string; privateKey?: string } }
    ).config;
    expect(config.serviceAccountEmail).toBe("dentist@project.iam.gserviceaccount.com");
    expect(config.privateKey).toBe("-----BEGIN PRIVATE KEY-----\nabc");
  });

  it("prefers service-account auth over delegated OAuth when both are available", async () => {
    const settingsRepository = new InMemorySettingsRepository();
    await seedGoogleMappings(settingsRepository);

    const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);
    await secretRepository.setSecret(
      SECRET_KEYS.googleServiceAccountEmail,
      "dentist@project.iam.gserviceaccount.com",
    );
    await secretRepository.setSecret(
      SECRET_KEYS.googleServiceAccountPrivateKey,
      "-----BEGIN PRIVATE KEY-----\\nabc",
    );

    const provider = await resolveCalendarProvider({
      settingsRepository,
      secretRepository,
      env: GOOGLE_ENV,
    });

    expect(provider).toBeInstanceOf(GoogleCalendarAdapter);
    const config = (
      provider as unknown as { config: { serviceAccountEmail?: string; clientId?: string } }
    ).config;
    expect(config.serviceAccountEmail).toBe("dentist@project.iam.gserviceaccount.com");
    expect(config.clientId).toBeUndefined();
  });
});
