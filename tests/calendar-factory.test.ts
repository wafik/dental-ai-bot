import { describe, expect, it } from "bun:test";
import { resolveCalendarProvider } from "@/providers/calendar/calendar-factory";
import { GoogleCalendarAdapter } from "@/providers/calendar/google-calendar-adapter";
import { OutlookCalendarAdapter } from "@/providers/calendar/outlook-calendar-adapter";
import { InMemorySettingsRepository } from "@/repository/in-memory-settings-repository";

/**
 * The factory is fail-closed: unless CALENDAR_PROVIDER is explicitly "none",
 * both providers must resolve completely or the call throws. Missing
 * configuration can therefore never masquerade as a successful sync.
 */
describe("Production Calendar Provider Factory & DB Settings Resolution", () => {
  it("rejects an unconfigured deployment instead of falling back to a no-op provider", async () => {
    // An empty environment is the documented unconfigured deployment, and it
    // must refuse to book rather than silently skip both calendars.
    await expect(resolveCalendarProvider({ env: {} })).rejects.toThrow(
      "Both Google Calendar and Outlook must be configured",
    );
  });

  it("requires a complete Google and Outlook provider pair", async () => {
    const settingsRepo = new InMemorySettingsRepository();
    await settingsRepo.setSetting("CALENDAR_PROVIDER", "both");
    for (const provider of ["google", "outlook"] as const) {
      for (const dentistId of ["junior", "senior-1", "senior-2"] as const) {
        await settingsRepo.upsertDentistCalendarMapping({
          dentistId,
          provider,
          calendarId: `${dentistId}@${provider}.example`,
        });
      }
    }

    const providers = await resolveCalendarProvider({
      settingsRepository: settingsRepo,
      env: {
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
        GOOGLE_REFRESH_TOKEN: "google-refresh",
        MICROSOFT_TENANT_ID: "tenant-id",
        MICROSOFT_CLIENT_ID: "microsoft-id",
        MICROSOFT_CLIENT_SECRET: "microsoft-secret",
        MICROSOFT_REFRESH_TOKEN: "microsoft-refresh",
      },
    });

    expect(providers).toHaveProperty("google", expect.any(GoogleCalendarAdapter));
    expect(providers).toHaveProperty("outlook", expect.any(OutlookCalendarAdapter));
  });

  it("rejects a configured deployment that is missing one provider", async () => {
    const settingsRepo = new InMemorySettingsRepository();
    await settingsRepo.setSetting("CALENDAR_PROVIDER", "both");
    for (const dentistId of ["junior", "senior-1", "senior-2"] as const) {
      await settingsRepo.upsertDentistCalendarMapping({
        dentistId,
        provider: "google",
        calendarId: `${dentistId}@google.example`,
      });
    }

    await expect(
      resolveCalendarProvider({
        settingsRepository: settingsRepo,
        env: {
          GOOGLE_CLIENT_ID: "google-id",
          GOOGLE_CLIENT_SECRET: "google-secret",
          GOOGLE_REFRESH_TOKEN: "google-refresh",
        },
      }),
    ).rejects.toThrow("Outlook credentials");
  });

  it("resolves both adapters using credentials from env and calendar IDs from SettingsRepository", async () => {
    const settingsRepo = new InMemorySettingsRepository();
    await settingsRepo.setSetting("CALENDAR_PROVIDER", "both");

    for (const provider of ["google", "outlook"] as const) {
      for (const dentistId of ["junior", "senior-1", "senior-2"] as const) {
        await settingsRepo.upsertDentistCalendarMapping({
          dentistId,
          provider,
          calendarId: `${dentistId}-db@${provider}.example`,
        });
      }
    }

    const providers = await resolveCalendarProvider({
      settingsRepository: settingsRepo,
      env: {
        GOOGLE_CLIENT_ID: "test-google-client-id",
        GOOGLE_CLIENT_SECRET: "test-google-secret",
        GOOGLE_REFRESH_TOKEN: "test-google-refresh-token",
        MICROSOFT_TENANT_ID: "test-tenant-id",
        MICROSOFT_CLIENT_ID: "test-client-id",
        MICROSOFT_CLIENT_SECRET: "test-client-secret",
        MICROSOFT_REFRESH_TOKEN: "test-refresh-token",
      },
    });

    expect(providers.google).toBeInstanceOf(GoogleCalendarAdapter);
    expect(providers.outlook).toBeInstanceOf(OutlookCalendarAdapter);
  });

  it("falls back to env dentist calendar IDs when not present in DB", async () => {
    const settingsRepo = new InMemorySettingsRepository();

    const providers = await resolveCalendarProvider({
      settingsRepository: settingsRepo,
      env: {
        CALENDAR_PROVIDER: "both",
        GOOGLE_CLIENT_ID: "test-google-client-id",
        GOOGLE_CLIENT_SECRET: "test-google-secret",
        GOOGLE_REFRESH_TOKEN: "test-google-refresh-token",
        GOOGLE_CALENDAR_JUNIOR: "junior-env@group.calendar.google.com",
        GOOGLE_CALENDAR_SENIOR_1: "senior1-env@group.calendar.google.com",
        GOOGLE_CALENDAR_SENIOR_2: "senior2-env@group.calendar.google.com",
        MICROSOFT_TENANT_ID: "test-tenant-id",
        MICROSOFT_CLIENT_ID: "test-client-id",
        MICROSOFT_CLIENT_SECRET: "test-client-secret",
        MICROSOFT_REFRESH_TOKEN: "test-refresh-token",
        MICROSOFT_CALENDAR_JUNIOR: "junior@clinic.onmicrosoft.com",
        MICROSOFT_CALENDAR_SENIOR_1: "senior1@clinic.onmicrosoft.com",
        MICROSOFT_CALENDAR_SENIOR_2: "senior2@clinic.onmicrosoft.com",
      },
    });

    expect(providers.google).toBeInstanceOf(GoogleCalendarAdapter);
    expect(providers.outlook).toBeInstanceOf(OutlookCalendarAdapter);
  });

  it("honors an explicit none setting from the database over any environment value", async () => {
    const settingsRepo = new InMemorySettingsRepository();
    await settingsRepo.setSetting("CALENDAR_PROVIDER", "none");

    const providers = await resolveCalendarProvider({
      settingsRepository: settingsRepo,
      env: {
        CALENDAR_PROVIDER: "both",
        GOOGLE_CLIENT_ID: "test-google-client-id",
        GOOGLE_CLIENT_SECRET: "test-google-secret",
        GOOGLE_REFRESH_TOKEN: "test-google-refresh-token",
      },
    });

    expect(providers).toEqual({});
  });
});
