import { describe, expect, it } from "bun:test";
import { resolveCalendarProvider } from "@/providers/calendar/calendar-factory";
import { NoopCalendarProvider } from "@/providers/calendar/noop-calendar-provider";
import { GoogleCalendarAdapter } from "@/providers/calendar/google-calendar-adapter";
import { OutlookCalendarAdapter } from "@/providers/calendar/outlook-calendar-adapter";
import { InMemorySettingsRepository } from "@/repository/in-memory-settings-repository";

describe("Production Calendar Provider Factory & DB Settings Resolution", () => {
  it("defaults to NoopCalendarProvider when no external provider is configured", async () => {
    const provider = await resolveCalendarProvider({ env: {} });
    expect(provider).toBeInstanceOf(NoopCalendarProvider);
  });

  it("resolves GoogleCalendarAdapter using credentials from env and calendar IDs from SettingsRepository", async () => {
    const settingsRepo = new InMemorySettingsRepository();
    await settingsRepo.setSetting("CALENDAR_PROVIDER", "google");

    // Seed dentist calendar IDs into DB
    await settingsRepo.upsertDentistCalendarMapping({
      dentistId: "junior",
      provider: "google",
      calendarId: "junior-db@calendar.google.com",
    });
    await settingsRepo.upsertDentistCalendarMapping({
      dentistId: "senior-1",
      provider: "google",
      calendarId: "senior1-db@calendar.google.com",
    });
    await settingsRepo.upsertDentistCalendarMapping({
      dentistId: "senior-2",
      provider: "google",
      calendarId: "senior2-db@calendar.google.com",
    });

    const env = {
      GOOGLE_CLIENT_ID: "test-google-client-id",
      GOOGLE_CLIENT_SECRET: "test-google-secret",
      GOOGLE_REFRESH_TOKEN: "test-google-refresh-token",
    };

    const provider = await resolveCalendarProvider({
      settingsRepository: settingsRepo,
      env,
    });

    expect(provider).toBeInstanceOf(GoogleCalendarAdapter);
  });

  it("resolves OutlookCalendarAdapter using credentials from env and calendar IDs from SettingsRepository", async () => {
    const settingsRepo = new InMemorySettingsRepository();
    await settingsRepo.setSetting("CALENDAR_PROVIDER", "outlook");

    await settingsRepo.upsertDentistCalendarMapping({
      dentistId: "junior",
      provider: "outlook",
      calendarId: "junior@clinic.onmicrosoft.com",
    });
    await settingsRepo.upsertDentistCalendarMapping({
      dentistId: "senior-1",
      provider: "outlook",
      calendarId: "senior1@clinic.onmicrosoft.com",
    });
    await settingsRepo.upsertDentistCalendarMapping({
      dentistId: "senior-2",
      provider: "outlook",
      calendarId: "senior2@clinic.onmicrosoft.com",
    });

    const env = {
      MICROSOFT_TENANT_ID: "test-tenant-id",
      MICROSOFT_CLIENT_ID: "test-client-id",
      MICROSOFT_CLIENT_SECRET: "test-client-secret",
      MICROSOFT_REFRESH_TOKEN: "test-refresh-token",
    };

    const provider = await resolveCalendarProvider({
      settingsRepository: settingsRepo,
      env,
    });

    expect(provider).toBeInstanceOf(OutlookCalendarAdapter);
  });

  it("gracefully falls back to env dentist calendar IDs when not present in DB", async () => {
    const settingsRepo = new InMemorySettingsRepository();

    const env = {
      CALENDAR_PROVIDER: "google",
      GOOGLE_CLIENT_ID: "test-google-client-id",
      GOOGLE_CLIENT_SECRET: "test-google-secret",
      GOOGLE_REFRESH_TOKEN: "test-google-refresh-token",
      GOOGLE_CALENDAR_JUNIOR: "junior-env@group.calendar.google.com",
      GOOGLE_CALENDAR_SENIOR_1: "senior1-env@group.calendar.google.com",
      GOOGLE_CALENDAR_SENIOR_2: "senior2-env@group.calendar.google.com",
    };

    const provider = await resolveCalendarProvider({
      settingsRepository: settingsRepo,
      env,
    });

    expect(provider).toBeInstanceOf(GoogleCalendarAdapter);
  });
});
