import type { CalendarProviderSet } from "../providers/calendar/calendar-provider";
import { resolveCalendarProvider } from "../providers/calendar/calendar-factory";
import type { SettingsRepository } from "../repository/settings-repository";
import type { SecretRepository } from "../repository/secret-repository";
import {
  getRuntimeSecretRepository,
  getRuntimeSettingsRepository,
} from "../repository/runtime-repositories";
import { CALENDAR_PROVIDER_SETTING } from "../domain/admin-settings";
import { ALL_SECRET_KEYS } from "../security/secret-keys";

export type CalendarProviderCacheDeps = {
  settingsRepository?: SettingsRepository;
  secretRepository?: SecretRepository;
  env?: Record<string, string | undefined>;
};

let cachedProviders: CalendarProviderSet | null = null;
let cachedFingerprint: string | null = null;

/**
 * Drops the process-local provider cache. Tests call this between cases; the
 * fingerprint mechanism itself handles normal admin changes.
 */
export function resetCalendarProviderCache(): void {
  cachedProviders = null;
  cachedFingerprint = null;
}

/**
 * Builds a version string covering everything that can change the resolved
 * providers: the active provider setting, every mapping, and the update time of
 * every stored secret. Reusing providers with an identical fingerprint keeps
 * their in-memory OAuth access token caches alive.
 */
async function computeFingerprint(
  settingsRepository: SettingsRepository,
  secretRepository: SecretRepository,
): Promise<string> {
  const providerSetting = (await settingsRepository.getSetting(CALENDAR_PROVIDER_SETTING)) ?? "";
  const mappings = await settingsRepository.getAllDentistCalendarMappings();
  const metadata = await secretRepository.getMetadata(ALL_SECRET_KEYS);

  const mappingPart = mappings
    .map((mapping) =>
      [
        mapping.dentistId,
        mapping.provider,
        mapping.calendarId,
        mapping.isActive ? "active" : "inactive",
      ].join("|"),
    )
    .sort()
    .join(",");

  const secretPart = ALL_SECRET_KEYS.map((key) => {
    const entry = metadata[key];
    return [key, entry?.isConfigured ? "configured" : "absent", entry?.updatedAt ?? ""].join("|");
  }).join(",");

  return [providerSetting.trim().toLowerCase(), mappingPart, secretPart].join("::");
}

/**
 * Returns the configured calendar providers, re-resolving them only when the
 * fingerprint of provider settings, mappings, or stored secrets changed.
 * Resolution failures are never cached, so a later request can retry.
 */
export async function getRuntimeCalendarProvider(
  deps: CalendarProviderCacheDeps = {},
): Promise<CalendarProviderSet> {
  const settingsRepository = deps.settingsRepository ?? getRuntimeSettingsRepository();
  const secretRepository = deps.secretRepository ?? getRuntimeSecretRepository();
  const env = deps.env ?? process.env;

  const fingerprint = await computeFingerprint(settingsRepository, secretRepository);

  if (cachedProviders && cachedFingerprint === fingerprint) {
    return cachedProviders;
  }

  const providers = await resolveCalendarProvider({
    settingsRepository,
    secretRepository,
    env,
  });

  cachedProviders = providers;
  cachedFingerprint = fingerprint;

  return providers;
}
