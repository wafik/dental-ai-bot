import { NextResponse } from "next/server";
import {
  CALENDAR_PROVIDER_SETTING,
  DENTIST_IDS,
  type AdminDentistMapping,
  type AdminSettingsUpdate,
  type AdminSettingsView,
  type CalendarProviderId,
  type DentistId,
  type MappingProviderId,
  type SecretMetadataView,
} from "../domain/admin-settings";
import type {
  DentistCalendarMappingRecord,
  SettingsRepository,
} from "../repository/settings-repository";
import type { SecretRepository } from "../repository/secret-repository";
import {
  getRuntimeAdminSessionRepository,
  getRuntimeLoginAttemptRepository,
} from "../repository/runtime-repositories";
import { ALL_SECRET_KEYS, type SecretKey } from "../security/secret-keys";
import { readSessionToken } from "../security/admin-cookie";
import { AdminAuthService } from "./admin-auth-service";

export type AdminSettingsDeps = {
  settingsRepository: SettingsRepository;
  secretRepository: SecretRepository;
};

type SettingsEnv = Record<string, string | undefined>;

const SECRET_KEY_SET = new Set<string>(ALL_SECRET_KEYS);

/**
 * Coerces persisted provider values to the supported enum; anything unknown
 * falls back to "none" so a bad row cannot enable an integration.
 */
export function normalizeCalendarProvider(raw: string | null | undefined): CalendarProviderId {
  const value = raw?.trim().toLowerCase();
  return value === "google" || value === "outlook" ? value : "none";
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

/**
 * Picks one row per dentist, preferring the active provider and live rows so
 * the admin view stays stable when historical mappings exist.
 */
function selectMapping(
  records: DentistCalendarMappingRecord[],
  preferredProvider: MappingProviderId,
): DentistCalendarMappingRecord | undefined {
  const byProvider = records.find(
    (record) => record.provider === preferredProvider && record.isActive,
  );
  if (byProvider) {
    return byProvider;
  }

  const preferredAnyState = records.find((record) => record.provider === preferredProvider);
  if (preferredAnyState) {
    return preferredAnyState;
  }

  return records.find((record) => record.isActive) ?? records[0];
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
 * Reads provider, dentist mappings, and secret metadata for the admin UI.
 * Secret plaintext is never part of the returned view.
 */
export async function readAdminSettings(deps: AdminSettingsDeps): Promise<AdminSettingsView> {
  const storedProvider = await deps.settingsRepository.getSetting(CALENDAR_PROVIDER_SETTING);
  const calendarProvider = normalizeCalendarProvider(storedProvider);
  const preferredProvider: MappingProviderId =
    calendarProvider === "outlook" ? "outlook" : "google";

  const records = await deps.settingsRepository.getAllDentistCalendarMappings();
  const usable = records.filter(
    (record) => isMappingProvider(record.provider) && isDentistId(record.dentistId),
  );

  const dentistMappings: AdminDentistMapping[] = DENTIST_IDS.map((dentistId) => {
    const matches = usable.filter((record) => record.dentistId === dentistId);
    const selected = selectMapping(matches, preferredProvider);
    if (!selected) {
      // Always return three editable rows even before any mapping is saved.
      return {
        dentistId,
        provider: preferredProvider,
        calendarId: "",
        isActive: true,
      };
    }

    return {
      dentistId,
      provider: selected.provider as MappingProviderId,
      calendarId: selected.calendarId,
      isActive: selected.isActive,
    };
  });

  const metadata = await deps.secretRepository.getMetadata(ALL_SECRET_KEYS);

  return {
    calendarProvider,
    dentistMappings,
    secrets: buildSecretView(metadata),
  };
}

/**
 * Persists provider, mapping, and secret changes, then returns the refreshed
 * write-only view. Blank secret values preserve what is already stored.
 */
export async function updateAdminSettings(
  deps: AdminSettingsDeps,
  input: AdminSettingsUpdate,
): Promise<AdminSettingsView> {
  await deps.settingsRepository.setSetting(CALENDAR_PROVIDER_SETTING, input.calendarProvider);

  for (const mapping of input.dentistMappings) {
    await deps.settingsRepository.upsertDentistCalendarMapping({
      dentistId: mapping.dentistId,
      provider: mapping.provider,
      calendarId: mapping.calendarId.trim(),
    });
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
