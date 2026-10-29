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

/** The editable shape a mapping takes while it is being changed on screen. */
export type CalendarMappingDraft = {
  dentistId: DentistId;
  provider: MappingProviderId;
  calendarId: string;
};

export type AiSettings = { baseUrl: string; model: string };

/** Last-resort endpoint and model, shared by the view, runtime config, and adapter. */
export const AI_SETTINGS_DEFAULTS: AiSettings = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};

/** Clinic-setting keys that persist the AI endpoint. Names match the env vars. */
export const AI_SETTING_KEYS = {
  baseUrl: "OPENAI_BASE_URL",
  model: "OPENAI_MODEL",
} as const;

export type AiFieldDef = {
  key: keyof AiSettings;
  label: string;
  placeholder: string;
  hint: string;
};

/** The editable, non-secret half of the OpenAI configuration. */
export const AI_FIELDS: AiFieldDef[] = [
  {
    key: "baseUrl",
    label: "Base URL",
    placeholder: AI_SETTINGS_DEFAULTS.baseUrl,
    hint: "OpenAI-compatible endpoint. Leave blank to use the environment value or the default.",
  },
  {
    key: "model",
    label: "Model",
    placeholder: AI_SETTINGS_DEFAULTS.model,
    hint: "Model name sent to the endpoint. Leave blank to use the default.",
  },
];

export type AdminSettingsView = {
  calendarProvider: CalendarProviderId;
  dentistMappings: AdminDentistMapping[];
  ai: AiSettings;
  secrets: Record<string, SecretMetadataView>;
};

export type AdminSettingsUpdate = {
  calendarProvider: CalendarProviderId;
  dentistMappings: Array<{
    dentistId: DentistId;
    provider: MappingProviderId;
    calendarId: string;
  }>;
  ai?: AiSettings;
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
        key: "google.serviceAccountEmail",
        label: "Service Account Email",
        placeholder: "name@project.iam.gserviceaccount.com",
      },
      {
        key: "google.serviceAccountPrivateKey",
        label: "Service Account Private Key",
        placeholder: "-----BEGIN PRIVATE KEY-----",
      },
      {
        key: "google.clientId",
        label: "OAuth Client ID (delegated)",
        placeholder: "....apps.googleusercontent.com",
      },
      {
        key: "google.clientSecret",
        label: "OAuth Client Secret (delegated)",
        placeholder: "Google OAuth client secret",
      },
      {
        key: "google.refreshToken",
        label: "OAuth Refresh Token (delegated)",
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

export const CALENDAR_PROVIDER_LABELS: Record<CalendarProviderId, string> = {
  none: "None (external calendar disabled)",
  google: "Google Calendar",
  outlook: "Outlook / Microsoft Graph",
};

/** Display names for the fixed dentist ids, shared by every admin section. */
export const DENTIST_LABELS: Record<DentistId, string> = {
  junior: "Dr. Junior",
  "senior-1": "Dr. Senior 1",
  "senior-2": "Dr. Senior 2",
};
