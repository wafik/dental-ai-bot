export type CalendarProviderId = "none" | "google" | "outlook";
export type MappingProviderId = "google" | "outlook";
export type DentistId = "junior" | "senior-1" | "senior-2";

export const DENTIST_IDS: readonly DentistId[] = ["junior", "senior-1", "senior-2"];

export type SecretMetadataView = { isConfigured: boolean; updatedAt?: string };

export type AdminDentistMapping = {
  dentistId: DentistId;
  provider: MappingProviderId;
  calendarId: string;
  isActive: boolean;
};

export type AdminSettingsView = {
  calendarProvider: CalendarProviderId;
  dentistMappings: AdminDentistMapping[];
  secrets: Record<string, SecretMetadataView>;
};

export type AdminSettingsUpdate = {
  calendarProvider: CalendarProviderId;
  dentistMappings: Array<{
    dentistId: DentistId;
    provider: MappingProviderId;
    calendarId: string;
  }>;
  secrets?: Record<string, string>;
};

export type SecretFieldDef = { key: string; label: string; placeholder: string };

export type SecretGroupDef = {
  id: "openai" | "google" | "microsoft";
  title: string;
  testProvider: "openai" | "google" | "microsoft";
  fields: SecretFieldDef[];
};

export const SECRET_GROUPS: SecretGroupDef[] = [
  {
    id: "openai",
    title: "OpenAI",
    testProvider: "openai",
    fields: [{ key: "openai.apiKey", label: "API Key", placeholder: "sk-..." }],
  },
  {
    id: "google",
    title: "Google Calendar",
    testProvider: "google",
    fields: [
      {
        key: "google.clientId",
        label: "Client ID",
        placeholder: "....apps.googleusercontent.com",
      },
      {
        key: "google.clientSecret",
        label: "Client Secret",
        placeholder: "Google OAuth client secret",
      },
      {
        key: "google.refreshToken",
        label: "Refresh Token",
        placeholder: "Google OAuth refresh token",
      },
    ],
  },
  {
    id: "microsoft",
    title: "Microsoft Outlook",
    testProvider: "microsoft",
    fields: [
      { key: "microsoft.tenantId", label: "Tenant ID", placeholder: "tenant id or common" },
      { key: "microsoft.clientId", label: "Client ID", placeholder: "Application client ID" },
      {
        key: "microsoft.clientSecret",
        label: "Client Secret",
        placeholder: "Application client secret",
      },
      {
        key: "microsoft.refreshToken",
        label: "Refresh Token",
        placeholder: "Microsoft OAuth refresh token",
      },
    ],
  },
];

export const CALENDAR_PROVIDER_SETTING = "CALENDAR_PROVIDER";
