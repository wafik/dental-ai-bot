export type DentistCalendarMapping = {
  junior: string;
  "senior-1": string;
  "senior-2": string;
};

export type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarIds: DentistCalendarMapping;
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
 * Does not require or validate Microsoft environment variables.
 */
export function getGoogleCalendarConfig(
  env: Record<string, string | undefined> = process.env,
): GoogleCalendarConfig {
  return {
    clientId: readRequiredEnv(env, "GOOGLE_CLIENT_ID"),
    clientSecret: readRequiredEnv(env, "GOOGLE_CLIENT_SECRET"),
    refreshToken: readRequiredEnv(env, "GOOGLE_REFRESH_TOKEN"),
    calendarIds: {
      junior: readRequiredEnv(env, "GOOGLE_CALENDAR_JUNIOR"),
      "senior-1": readRequiredEnv(env, "GOOGLE_CALENDAR_SENIOR_1"),
      "senior-2": readRequiredEnv(env, "GOOGLE_CALENDAR_SENIOR_2"),
    },
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
