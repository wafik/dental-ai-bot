import { NextResponse } from "next/server";
import {
  AI_SETTING_KEYS,
  CALENDAR_PROVIDER_SETTING,
  DENTIST_IDS,
  MAPPING_PROVIDERS,
  type AdminDentistMapping,
  type AdminSettingsUpdate,
  type AdminSettingsView,
  type CalendarProviderId,
  type DentistId,
  type MappingProviderId,
  type SecretMetadataView,
} from "../domain/admin-settings";
import type { SettingsRepository } from "../repository/settings-repository";
import type { SecretRepository } from "../repository/secret-repository";
import {
  getRuntimeAdminSessionRepository,
  getRuntimeLoginAttemptRepository,
} from "../repository/runtime-repositories";
import { ALL_SECRET_KEYS, type SecretKey } from "../security/secret-keys";
import { readSessionToken } from "../security/admin-cookie";
import { AdminAuthService } from "./admin-auth-service";
import { resolveAiSettings } from "./runtime-config";

export type AdminSettingsDeps = {
  settingsRepository: SettingsRepository;
  secretRepository: SecretRepository;
  env?: Record<string, string | undefined>;
};

type SettingsEnv = Record<string, string | undefined>;

const SECRET_KEY_SET = new Set<string>(ALL_SECRET_KEYS);

/**
 * Coerces persisted provider values to the supported enum. Any non-"none"
 * value means both calendars are enabled: earlier releases stored a single
 * "google" or "outlook", and the current requirement is to write to both.
 */
export function normalizeCalendarProvider(raw: string | null | undefined): CalendarProviderId {
  return raw?.trim().toLowerCase() === "none" ? "none" : "both";
}

function isDentistId(value: string): value is DentistId {
  return (DENTIST_IDS as readonly string[]).includes(value);
}

function isMappingProvider(value: string): value is MappingProviderId {
  return value === "google" || value === "outlook";
}

function isSecretKey(value: string): value is SecretKey {
  return SECRET_KEY_SET.has(value);
}

function buildSecretView(
  metadata: Record<string, { isConfigured: boolean; updatedAt?: string }>,
): Record<string, SecretMetadataView> {
  const view: Record<string, SecretMetadataView> = {};
  for (const key of ALL_SECRET_KEYS) {
    const entry = metadata[key];
    view[key] = entry?.isConfigured
      ? { isConfigured: true, ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}) }
      : { isConfigured: false };
  }
  return view;
}

/**
 * Reads provider, dentist mappings, AI endpoint, and secret metadata for the
 * admin UI. Secret plaintext is never part of the returned view.
 */
export async function readAdminSettings(deps: AdminSettingsDeps): Promise<AdminSettingsView> {
  const env = deps.env ?? process.env;
  const storedProvider = await deps.settingsRepository.getSetting(CALENDAR_PROVIDER_SETTING);
  const calendarProvider = normalizeCalendarProvider(storedProvider);

  const records = await deps.settingsRepository.getAllDentistCalendarMappings();
  const usable = records.filter(
    (record) => isMappingProvider(record.provider) && isDentistId(record.dentistId),
  );

  // One editable row per dentist carrying both provider calendar IDs. A blank
  // value means that provider has no calendar for this dentist.
  const dentistMappings: AdminDentistMapping[] = DENTIST_IDS.map((dentistId) => {
    const matches = usable.filter((record) => record.dentistId === dentistId && record.isActive);
    return {
      dentistId,
      googleCalendarId: matches.find((record) => record.provider === "google")?.calendarId ?? "",
      outlookCalendarId: matches.find((record) => record.provider === "outlook")?.calendarId ?? "",
    };
  });

  const metadata = await deps.secretRepository.getMetadata(ALL_SECRET_KEYS);

  return {
    calendarProvider,
    dentistMappings,
    ai: await resolveAiSettings(deps.settingsRepository, env),
    secrets: buildSecretView(metadata),
  };
}

/**
 * Persists provider, mapping, and secret changes, then returns the refreshed
 * write-only view. Blank secret values preserve what is stored; a blank
 * calendar ID clears that provider's mapping for the dentist.
 */
export async function updateAdminSettings(
  deps: AdminSettingsDeps,
  input: AdminSettingsUpdate,
): Promise<AdminSettingsView> {
  await deps.settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, input.calendarProvider);

  for (const mapping of input.dentistMappings) {
    const calendarIds: Record<MappingProviderId, string> = {
      google: mapping.googleCalendarId.trim(),
      outlook: mapping.outlookCalendarId.trim(),
    };

    for (const provider of MAPPING_PROVIDERS) {
      await deps.settingsRepository.upsertDentistCalendarMapping({
        dentistId: mapping.dentistId,
        provider,
        calendarId: calendarIds[provider],
      });
    }
  }

  if (input.ai) {
    await deps.settingsRepository.setSetting(
      AI_SETTING_KEYS.baseUrl,
      input.ai.baseUrl.trim(),
      "OpenAI-compatible base URL",
    );
    await deps.settingsRepository.setSetting(
      AI_SETTING_KEYS.model,
      input.ai.model.trim(),
      "Model name sent to the AI endpoint",
    );
  }

  for (const [key, rawValue] of Object.entries(input.secrets ?? {})) {
    if (!isSecretKey(key)) {
      continue;
    }

    const value = rawValue.trim();
    if (!value) {
      continue;
    }

    await deps.secretRepository.setSecret(key, value);
  }

  return readAdminSettings(deps);
}

export type AdminRequestAuthDeps = {
  authService?: AdminAuthService;
  env?: SettingsEnv;
};

export type AdminRequestAuthResult =
  | { ok: true; username: string; token: string }
  | { ok: false; response: Response };

/**
 * Resolves the admin session for a request. Callers map the failure response
 * straight to the client so no route duplicates the 401 shape.
 */
export async function authenticateAdminRequest(
  request: Request,
  deps: AdminRequestAuthDeps = {},
): Promise<AdminRequestAuthResult> {
  const env = deps.env ?? process.env;
  const token = readSessionToken(request, env);
  if (!token) {
    return { ok: false, response: unauthorizedResponse() };
  }

  const authService = deps.authService ?? createDefaultAdminAuthService(env);
  const session = await authService.validate(token);
  if (!session) {
    return { ok: false, response: unauthorizedResponse() };
  }

  return { ok: true, username: session.username, token };
}

export function unauthorizedResponse(): Response {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

/**
 * Builds the production auth service from shared runtime repositories.
 * Constructed lazily per request so admin changes take effect immediately.
 */
export function createDefaultAdminAuthService(env: SettingsEnv = process.env): AdminAuthService {
  return new AdminAuthService({
    sessionRepository: getRuntimeAdminSessionRepository(),
    attemptRepository: getRuntimeLoginAttemptRepository(),
    env: {
      ADMIN_USERNAME: env.ADMIN_USERNAME,
      ADMIN_PASSWORD_HASH: env.ADMIN_PASSWORD_HASH,
    },
  });
}
