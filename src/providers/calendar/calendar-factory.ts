import type { CalendarProvider } from "./calendar-provider";
import { NoopCalendarProvider } from "./noop-calendar-provider";
import { GoogleCalendarAdapter } from "./google-calendar-adapter";
import { OutlookCalendarAdapter } from "./outlook-calendar-adapter";
import type { SettingsRepository } from "../../repository/settings-repository";
import type { SecretRepository } from "../../repository/secret-repository";
import type { DentistCalendarMapping } from "../../config/calendar";
import { CALENDAR_PROVIDER_SETTING } from "../../domain/admin-settings";
import { ENV_FALLBACK_KEYS, SECRET_KEYS, type SecretKey } from "../../security/secret-keys";

export type CalendarFactoryOptions = {
  settingsRepository?: SettingsRepository;
  secretRepository?: SecretRepository;
  env?: Record<string, string | undefined>;
};

const GOOGLE_CREDENTIAL_KEYS: readonly SecretKey[] = [
  SECRET_KEYS.googleClientId,
  SECRET_KEYS.googleClientSecret,
  SECRET_KEYS.googleRefreshToken,
];

const MICROSOFT_CREDENTIAL_KEYS: readonly SecretKey[] = [
  SECRET_KEYS.microsoftTenantId,
  SECRET_KEYS.microsoftClientId,
  SECRET_KEYS.microsoftClientSecret,
  SECRET_KEYS.microsoftRefreshToken,
];

/**
 * Builds an environment view where database-stored credentials override the
 * process environment. Empty or whitespace-only stored values are treated as
 * absent so the documented environment bootstrap fallback keeps working.
 */
async function resolveCredentialEnv(
  env: Record<string, string | undefined>,
  secretRepository: SecretRepository | undefined,
  keys: readonly SecretKey[],
): Promise<Record<string, string | undefined>> {
  const resolvedEnv: Record<string, string | undefined> = { ...env };

  if (!secretRepository) {
    return resolvedEnv;
  }

  for (const key of keys) {
    const storedValue = (await secretRepository.getSecret(key))?.trim();
    if (storedValue) {
      resolvedEnv[ENV_FALLBACK_KEYS[key]] = storedValue;
    }
  }

  return resolvedEnv;
}

/**
 * Resolves and instantiates the active CalendarProvider.
 * Dynamically resolves dentist calendar IDs from the database (SettingsRepository)
 * with graceful fallback to environment variables.
 *
 * Credentials are resolved per field from the encrypted secret store first, then
 * the matching environment variable, so admin changes take effect without a
 * process restart.
 */
export async function resolveCalendarProvider(
  options: CalendarFactoryOptions = {},
): Promise<CalendarProvider> {
  const env = options.env ?? process.env;
  const settingsRepo = options.settingsRepository;
  const secretRepo = options.secretRepository;

  // 1. Determine active provider ("google", "outlook", or none)
  let activeProvider = env.CALENDAR_PROVIDER?.toLowerCase().trim();
  if (settingsRepo) {
    const dbProvider = await settingsRepo.getSetting(CALENDAR_PROVIDER_SETTING);
    if (dbProvider) {
      activeProvider = dbProvider.toLowerCase().trim();
    }
  }

  if (activeProvider === "google") {
    const resolvedEnv = await resolveCredentialEnv(env, secretRepo, GOOGLE_CREDENTIAL_KEYS);

    const clientId = resolvedEnv.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = resolvedEnv.GOOGLE_CLIENT_SECRET?.trim();
    const refreshToken = resolvedEnv.GOOGLE_REFRESH_TOKEN?.trim();

    if (!clientId || !clientSecret || !refreshToken) {
      return new NoopCalendarProvider();
    }

    // Resolve dentist calendar IDs from DB with env fallback
    const calendarIds = await resolveDentistMappings("google", settingsRepo, {
      junior: resolvedEnv.GOOGLE_CALENDAR_JUNIOR?.trim() ?? "",
      "senior-1": resolvedEnv.GOOGLE_CALENDAR_SENIOR_1?.trim() ?? "",
      "senior-2": resolvedEnv.GOOGLE_CALENDAR_SENIOR_2?.trim() ?? "",
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
    const resolvedEnv = await resolveCredentialEnv(env, secretRepo, MICROSOFT_CREDENTIAL_KEYS);

    const tenantId = resolvedEnv.MICROSOFT_TENANT_ID?.trim();
    const clientId = resolvedEnv.MICROSOFT_CLIENT_ID?.trim();
    const clientSecret = resolvedEnv.MICROSOFT_CLIENT_SECRET?.trim();
    const refreshToken = resolvedEnv.MICROSOFT_REFRESH_TOKEN?.trim();

    if (!tenantId || !clientId || !clientSecret || !refreshToken) {
      return new NoopCalendarProvider();
    }

    // Resolve dentist calendar IDs from DB with env fallback
    const calendarIds = await resolveDentistMappings("outlook", settingsRepo, {
      junior: resolvedEnv.MICROSOFT_CALENDAR_JUNIOR?.trim() ?? "",
      "senior-1": resolvedEnv.MICROSOFT_CALENDAR_SENIOR_1?.trim() ?? "",
      "senior-2": resolvedEnv.MICROSOFT_CALENDAR_SENIOR_2?.trim() ?? "",
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
