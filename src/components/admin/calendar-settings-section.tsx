"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CALENDAR_PROVIDER_LABELS,
  DENTIST_IDS,
  DENTIST_LABELS,
  type CalendarMappingDraft,
  type CalendarProviderId,
  type DentistId,
} from "@/domain/admin-settings";
import { calendarIdError } from "@/utils/form-validation";

export type CalendarSettingsSectionProps = {
  provider: CalendarProviderId;
  onProviderChange: (provider: CalendarProviderId) => void;
  mappings: CalendarMappingDraft[];
  onMappingChange: (
    dentistId: DentistId,
    patch: Partial<Omit<CalendarMappingDraft, "dentistId">>,
  ) => void;
  /** Prevents edits before the stored settings arrive and overwrite them. */
  disabled?: boolean;
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const PROVIDER_FIELDS = [
  { key: "googleCalendarId", label: "Google Calendar ID" },
  { key: "outlookCalendarId", label: "Outlook Calendar ID" },
] as const;

/**
 * Presentational calendar mode and per-dentist Google + Outlook calendar IDs.
 */
export function CalendarSettingsSection({
  provider,
  onProviderChange,
  mappings,
  onMappingChange,
  disabled = false,
}: CalendarSettingsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendar integration</CardTitle>
        <CardDescription>
          Every booking is written to both Google Calendar and Outlook. Map each dentist to a
          calendar in each provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="calendar-provider" className="text-sm font-medium text-foreground">
            Calendar synchronization
          </label>
          <select
            id="calendar-provider"
            className={SELECT_CLASS}
            value={provider}
            disabled={disabled}
            onChange={(event) => onProviderChange(event.target.value as CalendarProviderId)}
          >
            {Object.entries(CALENDAR_PROVIDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">How to get a Calendar ID</p>
          <p className="mt-1">
            Calendars are never detected automatically. For each dentist, open their calendar in
            Google Calendar or Outlook, share it with the service account email (or the delegated
            OAuth account) using &quot;Make changes to events&quot;, then copy the Calendar ID from
            the calendar&apos;s settings and paste it below.
          </p>
          <p className="mt-1">
            A Calendar ID is usually an email address, for example{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">clinic@gmail.com</code> or{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              abc123@group.calendar.google.com
            </code>
            .
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {DENTIST_IDS.map((id) => {
            const mapping = mappings.find((entry) => entry.dentistId === id);

            return (
              <div key={id} className="flex flex-col gap-2 rounded-lg border p-3">
                <span className="text-sm font-medium text-foreground">{DENTIST_LABELS[id]}</span>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {PROVIDER_FIELDS.map((field) => {
                    const value = mapping?.[field.key] ?? "";
                    const fieldError = calendarIdError(value);
                    const inputId = `mapping-${id}-${field.key}`;

                    return (
                      <Field
                        key={field.key}
                        data-invalid={Boolean(fieldError)}
                        className="flex-1 gap-1.5"
                      >
                        <FieldLabel
                          htmlFor={inputId}
                          className="text-xs font-normal text-muted-foreground"
                        >
                          {field.label}
                        </FieldLabel>
                        <Input
                          id={inputId}
                          value={value}
                          placeholder="e.g. clinic@gmail.com"
                          disabled={disabled}
                          onChange={(event) =>
                            onMappingChange(id, { [field.key]: event.target.value })
                          }
                          aria-invalid={Boolean(fieldError)}
                          aria-describedby={fieldError ? `${inputId}-error` : undefined}
                          className={cn(
                            fieldError && "border-destructive focus-visible:ring-destructive",
                          )}
                        />
                        <FieldError id={`${inputId}-error`} className="text-xs">
                          {fieldError}
                        </FieldError>
                      </Field>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
