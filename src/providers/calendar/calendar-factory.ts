import type { CalendarProvider } from "./calendar-provider";
import { NoopCalendarProvider } from "./noop-calendar-provider";
import { GoogleCalendarAdapter } from "./google-calendar-adapter";
import { OutlookCalendarAdapter } from "./outlook-calendar-adapter";
import type { SettingsRepository } from "../../repository/settings-repository";
import type { DentistCalendarMapping } from "../../config/calendar";

export type CalendarFactoryOptions = {
  settingsRepository?: SettingsRepository;
  env?: Record<string, string | undefined>;
};

/**
 * Resolves and instantiates the active CalendarProvider.
 * Dynamically resolves dentist calendar IDs from the database (SettingsRepository)
 * with graceful fallback to environment variables.
 *
 * In production:
 * - Master secrets (OAuth client secrets, refresh tokens) are securely read from env/KMS.
 * - Dentist calendar mappings (IDs) are retrieved dynamically from the database.
 */
export async function resolveCalendarProvider(
  options: CalendarFactoryOptions = {},
): Promise<CalendarProvider> {
  const env = options.env ?? process.env;
  const settingsRepo = options.settingsRepository;

  // 1. Determine active provider ("google", "outlook", or none)
  let activeProvider = env.CALENDAR_PROVIDER?.toLowerCase().trim();
  if (settingsRepo) {
    const dbProvider = await settingsRepo.getSetting("CALENDAR_PROVIDER");
    if (dbProvider) {
      activeProvider = dbProvider.toLowerCase().trim();
    }
  }

  if (activeProvider === "google") {
    const clientId = env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
    const refreshToken = env.GOOGLE_REFRESH_TOKEN?.trim();

    if (!clientId || !clientSecret || !refreshToken) {
      return new NoopCalendarProvider();
    }

    // Resolve dentist calendar IDs from DB with env fallback
    const calendarIds = await resolveDentistMappings("google", settingsRepo, {
      junior: env.GOOGLE_CALENDAR_JUNIOR?.trim() ?? "",
      "senior-1": env.GOOGLE_CALENDAR_SENIOR_1?.trim() ?? "",
      "senior-2": env.GOOGLE_CALENDAR_SENIOR_2?.trim() ?? "",
    });

    if (!calendarIds.junior || !calendarIds["senior-1"] || !calendarIds["senior-2"]) {
      return new NoopCalendarProvider();
    }

    return new GoogleCalendarAdapter({
      clientId,
      clientSecret,
      refreshToken,
      calendarIds,
    });
  }

  if (activeProvider === "outlook") {
    const tenantId = env.MICROSOFT_TENANT_ID?.trim();
    const clientId = env.MICROSOFT_CLIENT_ID?.trim();
    const clientSecret = env.MICROSOFT_CLIENT_SECRET?.trim();
    const refreshToken = env.MICROSOFT_REFRESH_TOKEN?.trim();

    if (!tenantId || !clientId || !clientSecret || !refreshToken) {
      return new NoopCalendarProvider();
    }

    // Resolve dentist calendar IDs from DB with env fallback
    const calendarIds = await resolveDentistMappings("outlook", settingsRepo, {
      junior: env.MICROSOFT_CALENDAR_JUNIOR?.trim() ?? "",
      "senior-1": env.MICROSOFT_CALENDAR_SENIOR_1?.trim() ?? "",
      "senior-2": env.MICROSOFT_CALENDAR_SENIOR_2?.trim() ?? "",
    });

    if (!calendarIds.junior || !calendarIds["senior-1"] || !calendarIds["senior-2"]) {
      return new NoopCalendarProvider();
    }

    return new OutlookCalendarAdapter({
      tenantId,
      clientId,
      clientSecret,
      refreshToken,
      calendarIds,
    });
  }

  return new NoopCalendarProvider();
}

async function resolveDentistMappings(
  provider: "google" | "outlook",
  settingsRepo: SettingsRepository | undefined,
  fallback: DentistCalendarMapping,
): Promise<DentistCalendarMapping> {
  const result: DentistCalendarMapping = { ...fallback };

  if (settingsRepo) {
    const dbMappings = await settingsRepo.getDentistCalendarMappings(provider);
    for (const mapping of dbMappings) {
      if (mapping.dentistId === "junior" && mapping.calendarId) {
        result.junior = mapping.calendarId;
      } else if (mapping.dentistId === "senior-1" && mapping.calendarId) {
        result["senior-1"] = mapping.calendarId;
      } else if (mapping.dentistId === "senior-2" && mapping.calendarId) {
        result["senior-2"] = mapping.calendarId;
      }
    }
  }

  return result;
}
