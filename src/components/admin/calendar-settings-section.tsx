"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CalendarProviderId, DentistId, MappingProviderId } from "@/domain/admin-settings";

export type CalendarMappingDraft = {
  dentistId: DentistId;
  provider: MappingProviderId;
  calendarId: string;
};

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

const DENTIST_LABELS: Array<{ id: DentistId; label: string }> = [
  { id: "junior", label: "Dr. Junior" },
  { id: "senior-1", label: "Dr. Senior 1" },
  { id: "senior-2", label: "Dr. Senior 2" },
];

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Presentational calendar provider and per-dentist mapping editor.
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
          Choose the active calendar provider and map each dentist to a calendar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="calendar-provider" className="text-sm font-medium text-foreground">
            Calendar provider
          </label>
          <select
            id="calendar-provider"
            className={SELECT_CLASS}
            value={provider}
            disabled={disabled}
            onChange={(event) => onProviderChange(event.target.value as CalendarProviderId)}
          >
            <option value="none">None (external calendar disabled)</option>
            <option value="google">Google Calendar</option>
            <option value="outlook">Outlook / Microsoft Graph</option>
          </select>
        </div>

        <div className="flex flex-col gap-4">
          {DENTIST_LABELS.map(({ id, label }) => {
            const mapping = mappings.find((entry) => entry.dentistId === id);
            const mappingProvider = mapping?.provider ?? "google";
            const calendarId = mapping?.calendarId ?? "";

            return (
              <div key={id} className="flex flex-col gap-2 rounded-lg border p-3">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex flex-col gap-1.5 sm:w-44">
                    <label
                      htmlFor={`mapping-${id}-provider`}
                      className="text-xs text-muted-foreground"
                    >
                      Provider
                    </label>
                    <select
                      id={`mapping-${id}-provider`}
                      className={SELECT_CLASS}
                      value={mappingProvider}
                      disabled={disabled}
                      onChange={(event) =>
                        onMappingChange(id, {
                          provider: event.target.value as MappingProviderId,
                        })
                      }
                    >
                      <option value="google">Google Calendar</option>
                      <option value="outlook">Outlook</option>
                    </select>
                  </div>

                  <div className="flex flex-1 flex-col gap-1.5">
                    <label
                      htmlFor={`mapping-${id}-calendar`}
                      className="text-xs text-muted-foreground"
                    >
                      Calendar ID
                    </label>
                    <Input
                      id={`mapping-${id}-calendar`}
                      value={calendarId}
                      placeholder="Calendar identifier"
                      disabled={disabled}
                      onChange={(event) => onMappingChange(id, { calendarId: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
