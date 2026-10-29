"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AI_SETTINGS_DEFAULTS,
  DENTIST_IDS,
  type AdminDentistMapping,
  type AdminSettingsView,
  type AiSettings,
  type CalendarMappingDraft,
  type CalendarProviderId,
  type DentistId,
  type SecretGroupDef,
  type SecretMetadataView,
} from "@/domain/admin-settings";
import {
  AdminApiError,
  fetchAdminSettings,
  logoutAdmin,
  saveAdminSettings,
  testAdminConnection,
} from "@/services/admin-settings-client";
import { aiFieldErrors, calendarIdError, validateSecretField } from "@/utils/form-validation";

const DEFAULT_MAPPING_PROVIDER = "google" as const;

/** Every dentist always gets a row, even when the stored settings omit one. */
export function toMappingDrafts(mappings: AdminDentistMapping[]): CalendarMappingDraft[] {
  return DENTIST_IDS.map((dentistId) => {
    const existing = mappings.find((mapping) => mapping.dentistId === dentistId);
    return {
      dentistId,
      provider: existing?.provider ?? DEFAULT_MAPPING_PROVIDER,
      calendarId: existing?.calendarId ?? "",
    };
  });
}

/**
 * Owns the admin settings screen's state: what is stored, what is being
 * edited, and which request is in flight. Components below it stay
 * presentational.
 */
export function useAdminSettings() {
  const [settings, setSettings] = React.useState<AdminSettingsView | null>(null);
  const [provider, setProvider] = React.useState<CalendarProviderId>("none");
  const [ai, setAi] = React.useState<AiSettings>(AI_SETTINGS_DEFAULTS);
  const [mappings, setMappings] = React.useState<CalendarMappingDraft[]>(() => toMappingDrafts([]));
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [testingProvider, setTestingProvider] = React.useState<string | null>(null);

  const redirectToLogin = React.useCallback(() => {
    window.location.assign("/admin/login");
  }, []);

  const applySettings = React.useCallback((next: AdminSettingsView) => {
    setSettings(next);
    setProvider(next.calendarProvider);
    setAi(next.ai);
    setMappings(toMappingDrafts(next.dentistMappings));
  }, []);

  const handleError = React.useCallback(
    (caught: unknown, fallback: string) => {
      if (caught instanceof AdminApiError && caught.status === 401) {
        redirectToLogin();
        return;
      }
      setError(caught instanceof Error ? caught.message : fallback);
    },
    [redirectToLogin],
  );

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await fetchAdminSettings();
        if (!cancelled) {
          applySettings(next);
          setError(null);
        }
      } catch (caught: unknown) {
        if (!cancelled) {
          handleError(caught, "Unable to load settings. Please reload the page.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [applySettings, handleError]);

  const mappingChange = React.useCallback(
    (dentistId: DentistId, patch: Partial<Omit<CalendarMappingDraft, "dentistId">>) => {
      setMappings((current) =>
        current.map((mapping) =>
          mapping.dentistId === dentistId ? { ...mapping, ...patch } : mapping,
        ),
      );
    },
    [],
  );

  const draftChange = React.useCallback((key: string, value: string) => {
    setDrafts((current) => ({ ...current, [key]: value }));
  }, []);

  const aiChange = React.useCallback((patch: Partial<AiSettings>) => {
    setAi((current) => ({ ...current, ...patch }));
  }, []);

  // Blocks the save while any visible field would be rejected by the same
  // server rules, so a bad value never round-trips.
  const hasFieldErrors =
    Object.keys(aiFieldErrors(ai)).length > 0 ||
    mappings.some((mapping) => Boolean(calendarIdError(mapping.calendarId))) ||
    Object.entries(drafts).some(([key, value]) => Boolean(validateSecretField(key, value)));

  const save = React.useCallback(async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    try {
      const next = await saveAdminSettings({
        calendarProvider: provider,
        dentistMappings: mappings.map((mapping) => ({
          dentistId: mapping.dentistId,
          provider: mapping.provider,
          calendarId: mapping.calendarId.trim(),
        })),
        ai: { baseUrl: ai.baseUrl.trim(), model: ai.model.trim() },
        secrets: drafts,
      });

      applySettings(next);
      // Secrets are write-only: drop drafts so only configured status remains.
      setDrafts({});
      setError(null);
      toast.success("Settings saved");
    } catch (caught: unknown) {
      if (caught instanceof AdminApiError && caught.status === 401) {
        redirectToLogin();
        return;
      }
      toast.error(caught instanceof Error ? caught.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }, [applySettings, ai, drafts, mappings, provider, redirectToLogin, saving]);

  const test = React.useCallback(
    async (testProvider: SecretGroupDef["testProvider"]) => {
      if (testingProvider) {
        return;
      }

      setTestingProvider(testProvider);
      try {
        const result = await testAdminConnection(testProvider, drafts);
        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } catch (caught: unknown) {
        if (caught instanceof AdminApiError && caught.status === 401) {
          redirectToLogin();
          return;
        }
        toast.error("Connection test failed.");
      } finally {
        setTestingProvider(null);
      }
    },
    [drafts, redirectToLogin, testingProvider],
  );

  const logout = React.useCallback(async () => {
    await logoutAdmin();
    redirectToLogin();
  }, [redirectToLogin]);

  const secrets: Record<string, SecretMetadataView> = settings?.secrets ?? {};

  return {
    settings,
    secrets,
    provider,
    setProvider,
    ai,
    aiChange,
    mappings,
    mappingChange,
    drafts,
    draftChange,
    loading,
    saving,
    error,
    testingProvider,
    hasFieldErrors,
    save,
    test,
    logout,
  };
}
