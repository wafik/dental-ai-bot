import { createSign } from "node:crypto";
import {
  CalendarProviderError,
  normalizeCalendarInterval,
  type BusyInterval,
  type CalendarEventInput,
  type CalendarOperation,
  type CalendarProvider,
  type CreatedCalendarEvent,
} from "./calendar-provider";
import type { DentistCalendarMapping, GoogleCalendarConfig } from "../../config/calendar";

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Builds the RS256 JWT assertion for the OAuth 2.0 JWT bearer grant. Service
 * accounts have no refresh token, so this replaces the refresh-token exchange.
 * Accepts both real newlines and the escaped form used by env storage.
 */
export function buildServiceAccountAssertion(
  serviceAccountEmail: string,
  privateKey: string,
  nowMs: number = Date.now(),
): string {
  const issuedAt = Math.floor(nowMs / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(
    JSON.stringify({
      iss: serviceAccountEmail,
      scope: GOOGLE_CALENDAR_SCOPE,
      aud: GOOGLE_TOKEN_URI,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  )}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  return `${unsigned}.${base64Url(signer.sign(privateKey.replace(/\\n/g, "\n")))}`;
}

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

type GoogleFreeBusyResponse = {
  kind?: string;
  calendars?: Record<
    string,
    {
      busy?: Array<{ start?: string; end?: string }>;
      errors?: Array<{ domain?: string; reason?: string }>;
    }
  >;
};

type GoogleEventResponse = {
  id?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
};

export class GoogleCalendarAdapter implements CalendarProvider {
  private cachedAccessToken: {
    token: string;
    expiresAtMs: number;
  } | null = null;

  constructor(
    private readonly config: GoogleCalendarConfig,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && now < this.cachedAccessToken.expiresAtMs) {
      return this.cachedAccessToken.token;
    }

    if (this.config.serviceAccountEmail && this.config.privateKey) {
      return this.exchangeServiceAccountToken(now);
    }

    const bodyParams = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.clientId ?? "",
      client_secret: this.config.clientSecret ?? "",
      refresh_token: this.config.refreshToken ?? "",
    });

    let res: Response;
    try {
      res = await this.fetchFn("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: bodyParams.toString(),
      });
    } catch (err: unknown) {
      throw new CalendarProviderError({
        message: "Network failure while refreshing Google OAuth token",
        provider: "google",
        operation: "refreshToken",
        cause: err,
      });
    }

    if (!res.ok) {
      throw new CalendarProviderError({
        message: "Google OAuth refresh token exchange failed",
        provider: "google",
        operation: "refreshToken",
        status: res.status,
      });
    }

    const data = (await res.json()) as GoogleTokenResponse;
    if (!data.access_token) {
      throw new CalendarProviderError({
        message: "Google OAuth token response missing access_token",
        provider: "google",
        operation: "refreshToken",
      });
    }

    const expiresInSeconds = typeof data.expires_in === "number" ? data.expires_in : 3600;
    // Buffer renewal 60 seconds before expiration
    const safeLifetimeMs = Math.max(expiresInSeconds - 60, 10) * 1000;

    this.cachedAccessToken = {
      token: data.access_token,
      expiresAtMs: now + safeLifetimeMs,
    };

    return data.access_token;
  }

  /**
   * Exchanges a signed JWT assertion for an access token using the OAuth 2.0
   * JWT bearer grant.
   */
  private async exchangeServiceAccountToken(now: number): Promise<string> {
    const tokenUri = GOOGLE_TOKEN_URI;
    const assertion = buildServiceAccountAssertion(
      this.config.serviceAccountEmail ?? "",
      this.config.privateKey ?? "",
      now,
    );

    let res: Response;
    try {
      res = await this.fetchFn(tokenUri, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }).toString(),
      });
    } catch (err: unknown) {
      throw new CalendarProviderError({
        message: "Network failure while exchanging Google service-account token",
        provider: "google",
        operation: "refreshToken",
        cause: err,
      });
    }

    if (!res.ok) {
      throw new CalendarProviderError({
        message: "Google service-account token exchange failed",
        provider: "google",
        operation: "refreshToken",
        status: res.status,
      });
    }

    const data = (await res.json()) as GoogleTokenResponse;
    if (!data.access_token) {
      throw new CalendarProviderError({
        message: "Google service-account token response missing access_token",
        provider: "google",
        operation: "refreshToken",
      });
    }

    const expiresInSeconds = typeof data.expires_in === "number" ? data.expires_in : 3600;
    this.cachedAccessToken = {
      token: data.access_token,
      expiresAtMs: now + Math.max(expiresInSeconds - 60, 10) * 1000,
    };

    return data.access_token;
  }

  private resolveCalendarId(dentistId: string, operation: CalendarOperation): string {
    const calendarId = this.config.calendarIds[dentistId as keyof DentistCalendarMapping];

    if (!calendarId || calendarId.trim().length === 0) {
      throw new CalendarProviderError({
        message: `No Google Calendar mapping found for dentist '${dentistId}'`,
        provider: "google",
        operation,
      });
    }

    return calendarId;
  }

  async getBusyIntervals(input: {
    dentistId: string;
    start: string;
    end: string;
  }): Promise<BusyInterval[]> {
    const normalizedWindow = normalizeCalendarInterval(input.start, input.end);
    const calendarId = this.resolveCalendarId(input.dentistId, "getBusyIntervals");
    const token = await this.getAccessToken();

    const requestBody = {
      timeMin: normalizedWindow.start,
      timeMax: normalizedWindow.end,
      items: [{ id: calendarId }],
    };

    let res: Response;
    try {
      res = await this.fetchFn("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
    } catch (err: unknown) {
      throw new CalendarProviderError({
        message: "Network failure during Google Freebusy query",
        provider: "google",
        operation: "getBusyIntervals",
        cause: err,
      });
    }

    if (!res.ok) {
      throw new CalendarProviderError({
        message: "Google Freebusy API returned an error response",
        provider: "google",
        operation: "getBusyIntervals",
        status: res.status,
      });
    }

    const data = (await res.json()) as GoogleFreeBusyResponse;
    const calendarResult = data.calendars?.[calendarId];

    if (!calendarResult) {
      throw new CalendarProviderError({
        message: `Google Freebusy response missing data for calendar '${calendarId}'`,
        provider: "google",
        operation: "getBusyIntervals",
      });
    }

    if (calendarResult.errors && calendarResult.errors.length > 0) {
      throw new CalendarProviderError({
        message: `Google Freebusy reported calendar errors for '${calendarId}'`,
        provider: "google",
        operation: "getBusyIntervals",
      });
    }

    const rawBusy = calendarResult.busy ?? [];
    return rawBusy.map((item) => {
      if (!item.start || !item.end) {
        throw new CalendarProviderError({
          message: "Google Freebusy returned a busy interval without start or end",
          provider: "google",
          operation: "getBusyIntervals",
        });
      }
      return normalizeCalendarInterval(item.start, item.end);
    });
  }

  async createEvent(input: CalendarEventInput): Promise<CreatedCalendarEvent> {
    const normalizedInterval = normalizeCalendarInterval(input.start, input.end);
    const calendarId = this.resolveCalendarId(input.dentistId, "createEvent");
    const token = await this.getAccessToken();

    const encodedCalendarId = encodeURIComponent(calendarId);
    // Google accepts caller-supplied event IDs. "PUT" then upserts, so a retry
    // after an ambiguous failure updates the same event instead of duplicating.
    const eventId = toGoogleEventId(input.idempotencyKey);
    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events`;
    const url = eventId ? `${baseUrl}/${encodeURIComponent(eventId)}` : baseUrl;

    const requestBody = {
      summary: input.summary,
      description: input.description,
      start: { dateTime: normalizedInterval.start },
      end: { dateTime: normalizedInterval.end },
    };

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: eventId ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
    } catch (err: unknown) {
      throw new CalendarProviderError({
        message: "Network failure during Google event creation",
        provider: "google",
        operation: "createEvent",
        cause: err,
      });
    }

    if (!res.ok) {
      throw new CalendarProviderError({
        message: "Google Calendar API event creation failed",
        provider: "google",
        operation: "createEvent",
        status: res.status,
      });
    }

    const data = (await res.json()) as GoogleEventResponse;
    if (!data.id) {
      throw new CalendarProviderError({
        message: "Google Calendar event creation did not return an event ID",
        provider: "google",
        operation: "createEvent",
      });
    }

    return {
      id: data.id,
      start: normalizedInterval.start,
      end: normalizedInterval.end,
    };
  }

  async deleteEvent(input: { dentistId: string; eventId: string }): Promise<void> {
    const calendarId = this.resolveCalendarId(input.dentistId, "deleteEvent");
    const token = await this.getAccessToken();

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events/${encodeURIComponent(input.eventId)}`;

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err: unknown) {
      throw new CalendarProviderError({
        message: "Network failure during Google event deletion",
        provider: "google",
        operation: "deleteEvent",
        cause: err,
      });
    }

    // A previously deleted event is already in the desired state.
    if (res.status === 404 || res.status === 410) {
      return;
    }

    if (!res.ok) {
      throw new CalendarProviderError({
        message: "Google Calendar API event deletion failed",
        provider: "google",
        operation: "deleteEvent",
        status: res.status,
      });
    }
  }
}

/**
 * Google event IDs accept base32hex characters only (a-v, 0-9), 5-1024 long.
 * The appointment UUID without dashes is hex and therefore valid; anything else
 * falls back to a server-assigned ID rather than failing the booking.
 */
function toGoogleEventId(idempotencyKey: string | undefined): string | undefined {
  const candidate = idempotencyKey?.trim().toLowerCase();
  return candidate && /^[a-v0-9]{5,1024}$/.test(candidate) ? candidate : undefined;
}
