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

    const bodyParams = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
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
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events`;

    const requestBody = {
      summary: input.summary,
      description: input.description,
      start: { dateTime: normalizedInterval.start },
      end: { dateTime: normalizedInterval.end },
    };

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: "POST",
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
}
