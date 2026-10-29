"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarSettingsSection } from "@/components/admin/calendar-settings-section";
import { ConnectionStatusCard, type StatusRow } from "@/components/admin/connection-status-card";
import { CredentialsSection } from "@/components/admin/credentials-section";
import { ProviderBadge } from "@/components/admin/provider-badge";
import { SECRET_GROUPS } from "@/domain/admin-settings";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { calendarIdError } from "@/utils/form-validation";

const TAB_TRIGGERS = [
  { value: "overview", label: "Overview" },
  { value: "calendar", label: "Calendar" },
  { value: "credentials", label: "Credentials" },
] as const;

/** Summarises the stored state without exposing any secret value. */
function toStatusRows(secrets: Record<string, { isConfigured: boolean }>): StatusRow[] {
  return SECRET_GROUPS.map((group) => ({
    id: group.id,
    label: group.title,
    configured: group.fields.some((field) => Boolean(secrets[field.key]?.isConfigured)),
  }));
}

/**
 * Loads admin settings, edits non-secret configuration plus write-only secret
 * drafts, and clears those drafts after a successful save. Sections live in
 * tabs so each concern gets a screen of its own.
 */
export function AdminSettingsForm({ username }: { username: string }) {
  const admin = useAdminSettings();
  const [tab, setTab] = React.useState<string>("overview");

  const statusRows = toStatusRows(admin.secrets);

  const mappedDentists = admin.mappings.filter(
    (mapping) => mapping.calendarId.trim().length > 0 && !calendarIdError(mapping.calendarId),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Signed in as {username}</Badge>
            <ProviderBadge provider={admin.provider} />
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
            onClick={admin.logout}
            data-testid="logout"
          >
            Log out
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={admin.save}
            disabled={admin.saving || admin.loading || admin.hasFieldErrors}
            data-testid="save-settings"
          >
            {admin.saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>

      {admin.error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {admin.error}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList variant="line" className="w-full justify-start border-b pb-1">
          {TAB_TRIGGERS.map((trigger) => (
            <TabsTrigger key={trigger.value} value={trigger.value} className="flex-none px-3">
              {trigger.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <ConnectionStatusCard
            rows={statusRows}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTab("credentials")}
              >
                Manage credentials
              </Button>
            }
          />

          <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">AI endpoint</p>
            <p className="mt-1">
              <span data-testid="ai-base-url" className="font-medium text-foreground">
                {admin.ai.baseUrl}
              </span>{" "}
              serving{" "}
              <span data-testid="ai-model" className="font-medium text-foreground">
                {admin.ai.model}
              </span>
              .
            </p>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="mt-1 h-auto p-0"
              onClick={() => setTab("credentials")}
            >
              Edit endpoint
            </Button>
          </div>

          <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Calendar mappings</p>
            <p className="mt-1">
              <span data-testid="mapped-dentists" className="font-medium text-foreground">
                {mappedDentists}
              </span>{" "}
              of {admin.mappings.length} dentists have a calendar mapped.
            </p>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="mt-1 h-auto p-0"
              onClick={() => setTab("calendar")}
            >
              Edit mappings
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <CalendarSettingsSection
            provider={admin.provider}
            onProviderChange={admin.setProvider}
            mappings={admin.mappings}
            onMappingChange={admin.mappingChange}
            disabled={admin.loading}
          />
        </TabsContent>

        <TabsContent value="credentials">
          <CredentialsSection
            secrets={admin.secrets}
            drafts={admin.drafts}
            onDraftChange={admin.draftChange}
            onTest={admin.test}
            testingProvider={admin.testingProvider}
            ai={admin.ai}
            onAiChange={admin.aiChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
