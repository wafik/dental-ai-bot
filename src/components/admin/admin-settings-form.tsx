"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DENTIST_IDS,
  type AdminDentistMapping,
  type AdminSettingsView,
  type CalendarProviderId,
  type DentistId,
  type SecretMetadataView,
} from "@/domain/admin-settings";
import {
  CalendarSettingsSection,
  type CalendarMappingDraft,
} from "@/components/admin/calendar-settings-section";
import { CredentialsSection } from "@/components/admin/credentials-section";

type SettingsResponse = {
  success?: boolean;
  settings?: AdminSettingsView;
  error?: string;
};

type TestResponse = {
  success?: boolean;
  provider?: string;
  latencyMs?: number;
  message?: string;
};

const ADMIN_HEADERS = {
  "content-type": "application/json",
  "x-admin-action": "1",
} as const;

const DEFAULT_MAPPING_PROVIDER = "google" as const;

function asSettings(value: unknown): AdminSettingsView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as AdminSettingsView;
  if (!Array.isArray(candidate.dentistMappings)) {
    return null;
  }

  return candidate;
}

/**
 * Every dentist always gets a row, even when the stored settings omit one.
 */
function toMappingDrafts(mappings: AdminDentistMapping[]): CalendarMappingDraft[] {
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
 * Loads admin settings, edits non-secret configuration plus write-only secret
 * drafts, and clears those drafts after a successful save.
 */
export function AdminSettingsForm({ username }: { username: string }) {
  const [settings, setSettings] = React.useState<AdminSettingsView | null>(null);
  const [provider, setProvider] = React.useState<CalendarProviderId>("none");
  const [mappings, setMappings] = React.useState<CalendarMappingDraft[]>(() => toMappingDrafts([]));
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [testingProvider, setTestingProvider] = React.useState<string | null>(null);

  const applySettings = React.useCallback((next: AdminSettingsView) => {
    setSettings(next);
    setProvider(next.calendarProvider);
    setMappings(toMappingDrafts(next.dentistMappings));
  }, []);

  const redirectToLogin = React.useCallback(() => {
    window.location.assign("/admin/login");
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/v1/admin/settings", {
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });

        if (response.status === 401) {
          redirectToLogin();
          return;
        }

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as SettingsResponse;
        const next = asSettings(payload.settings);
        if (!next) {
          throw new Error("Malformed settings response");
        }

        if (!cancelled) {
          applySettings(next);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load settings. Please reload the page.");
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
  }, [applySettings, redirectToLogin]);

  const handleProviderChange = (next: CalendarProviderId) => {
    setProvider(next);
  };

  const handleMappingChange = (
    dentistId: DentistId,
    patch: Partial<Omit<CalendarMappingDraft, "dentistId">>,
  ) => {
    setMappings((current) =>
      current.map((mapping) =>
        mapping.dentistId === dentistId ? { ...mapping, ...patch } : mapping,
      ),
    );
  };

  const handleDraftChange = (key: string, value: string) => {
    setDrafts((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/v1/admin/settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: ADMIN_HEADERS,
        body: JSON.stringify({
          calendarProvider: provider,
          dentistMappings: mappings.map((mapping) => ({
            dentistId: mapping.dentistId,
            provider: mapping.provider,
            calendarId: mapping.calendarId.trim(),
          })),
          secrets: drafts,
        }),
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const payload = (await response.json().catch(() => ({}))) as SettingsResponse;
      if (!response.ok) {
        toast.error(typeof payload.error === "string" ? payload.error : "Unable to save settings.");
        return;
      }

      const next = asSettings(payload.settings);
      if (next) {
        applySettings(next);
      }
      // Secrets are write-only: drop drafts so only configured status remains.
      setDrafts({});
      toast.success("Settings saved");
    } catch {
      toast.error("Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (testProvider: "openai" | "google" | "microsoft") => {
    if (testingProvider) {
      return;
    }

    setTestingProvider(testProvider);
    try {
      const response = await fetch("/api/v1/admin/test-connection", {
        method: "POST",
        credentials: "same-origin",
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ provider: testProvider, draft: drafts }),
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const payload = (await response.json().catch(() => ({}))) as TestResponse;
      const message =
        typeof payload.message === "string" ? payload.message : "Connection test finished.";

      if (response.ok && payload.success) {
        toast.success(message);
      } else {
        toast.error(message);
      }
    } catch {
      toast.error("Connection test failed.");
    } finally {
      setTestingProvider(null);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/v1/admin/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "x-admin-action": "1" },
      });
    } catch {
      // Navigating away is still the correct outcome after logout.
    } finally {
      redirectToLogin();
    }
  };

  const secrets: Record<string, SecretMetadataView> = settings?.secrets ?? {};
  const openAiConfigured = Boolean(secrets["openai.apiKey"]?.isConfigured);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Signed in as {username}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Provider, mappings, and credentials apply without restarting the server.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleLogout}
            data-testid="logout"
          >
            Log out
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving || loading}
            data-testid="save-settings"
          >
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Credential status</CardTitle>
          <CardDescription>
            Values are encrypted at rest and never returned to the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="flex items-center gap-2">
            <span className="text-muted-foreground">OpenAI API key:</span>
            <span data-testid="status-openai">
              {openAiConfigured ? "Configured" : "Not configured"}
            </span>
          </p>
        </CardContent>
      </Card>

      <CalendarSettingsSection
        provider={provider}
        onProviderChange={handleProviderChange}
        mappings={mappings}
        onMappingChange={handleMappingChange}
        disabled={loading}
      />

      <CredentialsSection
        secrets={secrets}
        drafts={drafts}
        onDraftChange={handleDraftChange}
        onTest={handleTest}
        testingProvider={testingProvider}
      />
    </div>
  );
}
