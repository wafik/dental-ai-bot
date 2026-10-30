import type { CalendarProviderSet } from "./calendar-provider";
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
  SECRET_KEYS.googleServiceAccountEmail,
  SECRET_KEYS.googleServiceAccountPrivateKey,
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

type BuildResult =
  | { provider: GoogleCalendarAdapter | OutlookCalendarAdapter }
  | { missing: string[] };

function hasCompleteMappings(mapping: DentistCalendarMapping): boolean {
  return Boolean(mapping.junior && mapping["senior-1"] && mapping["senior-2"]);
}

async function buildGoogleProvider(
  env: Record<string, string | undefined>,
  secretRepository: SecretRepository | undefined,
  settingsRepo: SettingsRepository | undefined,
): Promise<BuildResult> {
  const resolvedEnv = await resolveCredentialEnv(env, secretRepository, GOOGLE_CREDENTIAL_KEYS);
  const calendarIds = await resolveDentistMappings("google", settingsRepo, {
    junior: resolvedEnv.GOOGLE_CALENDAR_JUNIOR?.trim() ?? "",
    "senior-1": resolvedEnv.GOOGLE_CALENDAR_SENIOR_1?.trim() ?? "",
    "senior-2": resolvedEnv.GOOGLE_CALENDAR_SENIOR_2?.trim() ?? "",
  });

  const serviceAccountEmail = resolvedEnv.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = resolvedEnv.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  const clientId = resolvedEnv.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = resolvedEnv.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = resolvedEnv.GOOGLE_REFRESH_TOKEN?.trim();

  const missing: string[] = [];
  if (!hasCompleteMappings(calendarIds)) {
    missing.push("Google dentist calendar IDs");
  }
  const hasServiceAccount = Boolean(serviceAccountEmail && privateKey);
  const hasDelegatedOAuth = Boolean(clientId && clientSecret && refreshToken);
  if (!hasServiceAccount && !hasDelegatedOAuth) {
    missing.push("Google credentials");
  }

  if (missing.length > 0) {
    return { missing };
  }

  // Service-account auth wins when configured; it needs no refresh token.
  if (hasServiceAccount) {
    return {
      provider: new GoogleCalendarAdapter({
        serviceAccountEmail,
        // Stored secrets keep real newlines; env values are usually escaped.
        privateKey: privateKey!.replace(/\\n/g, "\n"),
        calendarIds,
      }),
    };
  }

  return {
    provider: new GoogleCalendarAdapter({
      clientId,
      clientSecret,
      refreshToken,
      calendarIds,
    }),
  };
}

async function buildOutlookProvider(
  env: Record<string, string | undefined>,
  secretRepository: SecretRepository | undefined,
  settingsRepo: SettingsRepository | undefined,
): Promise<BuildResult> {
  const resolvedEnv = await resolveCredentialEnv(env, secretRepository, MICROSOFT_CREDENTIAL_KEYS);

  const tenantId = resolvedEnv.MICROSOFT_TENANT_ID?.trim();
  const clientId = resolvedEnv.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = resolvedEnv.MICROSOFT_CLIENT_SECRET?.trim();
  const refreshToken = resolvedEnv.MICROSOFT_REFRESH_TOKEN?.trim();

  const calendarIds = await resolveDentistMappings("outlook", settingsRepo, {
    junior: resolvedEnv.MICROSOFT_CALENDAR_JUNIOR?.trim() ?? "",
    "senior-1": resolvedEnv.MICROSOFT_CALENDAR_SENIOR_1?.trim() ?? "",
    "senior-2": resolvedEnv.MICROSOFT_CALENDAR_SENIOR_2?.trim() ?? "",
  });

  const missing: string[] = [];
  if (!tenantId || !clientId || !clientSecret || !refreshToken) {
    missing.push("Outlook credentials");
  }
  if (!hasCompleteMappings(calendarIds)) {
    missing.push("Outlook dentist calendar IDs");
  }

  if (missing.length > 0) {
    return { missing };
  }

  return {
    provider: new OutlookCalendarAdapter({
      tenantId: tenantId!,
      clientId: clientId!,
      clientSecret: clientSecret!,
      refreshToken: refreshToken!,
      calendarIds,
    }),
  };
}

/**
 * Resolves the configured Google and Outlook providers.
 *
 * The clinic requirement is that bookings reach both calendars, so the factory
 * is fail-closed: absent configuration is an error, not a silent local-only
 * success. The only local-only mode is the explicit `CALENDAR_PROVIDER=none`
 * setting used by local development and automated tests.
 *
 * Credentials resolve per field from the encrypted secret store first, then the
 * matching environment variable, so admin changes apply without a restart.
 */
export async function resolveCalendarProvider(
  options: CalendarFactoryOptions = {},
): Promise<CalendarProviderSet> {
  const env = options.env ?? process.env;
  const settingsRepo = options.settingsRepository;
  const secretRepo = options.secretRepository;

  // An explicit "none" disables external calendars. Anything else, including
  // an absent setting, requires both providers so missing configuration can
  // never masquerade as a successful synchronization.
  let activeProvider = env.CALENDAR_PROVIDER?.trim().toLowerCase() ?? "";
  if (settingsRepo) {
    const dbProvider = (await settingsRepo.getSetting(CALENDAR_PROVIDER_SETTING))
      ?.trim()
      .toLowerCase();
    if (dbProvider) {
      activeProvider = dbProvider;
    }
  }

  if (activeProvider === "none") {
    return {};
  }

  const google = await buildGoogleProvider(env, secretRepo, settingsRepo);
  const outlook = await buildOutlookProvider(env, secretRepo, settingsRepo);

  const missing = [
    ...("missing" in google ? google.missing : []),
    ...("missing" in outlook ? outlook.missing : []),
  ];

  if (missing.length > 0) {
    throw new Error(
      `Both Google Calendar and Outlook must be configured. Missing: ${missing.join("; ")}.`,
    );
  }

  const providers: CalendarProviderSet = {};
  if ("provider" in google) {
    providers.google = google.provider;
  }
  if ("provider" in outlook) {
    providers.outlook = outlook.provider;
  }
  return providers;
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
