export type DentistCalendarMapping = {
  junior: string;
  "senior-1": string;
  "senior-2": string;
};

export type GoogleCalendarConfig = {
  calendarIds: DentistCalendarMapping;
  /** Delegated OAuth credentials, exchanged via the refresh-token grant. */
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  /** Service-account credentials, exchanged via the JWT bearer grant. */
  serviceAccountEmail?: string;
  privateKey?: string;
};

export type OutlookCalendarConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarIds: DentistCalendarMapping;
};

function readRequiredEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required calendar environment variable: ${key}`);
  }
  return value.trim();
}

/**
 * Returns validated Google Calendar configuration from environment variables.
 * Service-account credentials take precedence when present; otherwise the
 * delegated refresh-token fields are required. Does not validate Microsoft.
 */
export function getGoogleCalendarConfig(
  env: Record<string, string | undefined> = process.env,
): GoogleCalendarConfig {
  const calendarIds = {
    junior: readRequiredEnv(env, "GOOGLE_CALENDAR_JUNIOR"),
    "senior-1": readRequiredEnv(env, "GOOGLE_CALENDAR_SENIOR_1"),
    "senior-2": readRequiredEnv(env, "GOOGLE_CALENDAR_SENIOR_2"),
  };

  const serviceAccountEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();

  if (serviceAccountEmail || privateKey) {
    if (!serviceAccountEmail || !privateKey) {
      throw new Error(
        "Both GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are required for service-account auth.",
      );
    }
    return {
      calendarIds,
      serviceAccountEmail,
      // Environment values carry escaped newlines; restore them for PEM parsing.
      privateKey: privateKey.replace(/\\n/g, "\n"),
    };
  }

  return {
    clientId: readRequiredEnv(env, "GOOGLE_CLIENT_ID"),
    clientSecret: readRequiredEnv(env, "GOOGLE_CLIENT_SECRET"),
    refreshToken: readRequiredEnv(env, "GOOGLE_REFRESH_TOKEN"),
    calendarIds,
  };
}

/**
 * Returns validated Outlook / Microsoft Graph configuration from environment variables.
 * Does not require or validate Google environment variables.
 */
export function getOutlookCalendarConfig(
  env: Record<string, string | undefined> = process.env,
): OutlookCalendarConfig {
  return {
    tenantId: readRequiredEnv(env, "MICROSOFT_TENANT_ID"),
    clientId: readRequiredEnv(env, "MICROSOFT_CLIENT_ID"),
    clientSecret: readRequiredEnv(env, "MICROSOFT_CLIENT_SECRET"),
    refreshToken: readRequiredEnv(env, "MICROSOFT_REFRESH_TOKEN"),
    calendarIds: {
      junior: readRequiredEnv(env, "MICROSOFT_CALENDAR_JUNIOR"),
      "senior-1": readRequiredEnv(env, "MICROSOFT_CALENDAR_SENIOR_1"),
      "senior-2": readRequiredEnv(env, "MICROSOFT_CALENDAR_SENIOR_2"),
    },
  };
}
