import {
  CalendarProviderError,
  normalizeCalendarInterval,
  type BusyInterval,
  type CalendarEventInput,
  type CalendarOperation,
  type CalendarProvider,
  type CreatedCalendarEvent,
} from "./calendar-provider";
import type { DentistCalendarMapping, OutlookCalendarConfig } from "../../config/calendar";

type MicrosoftTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

type GraphDateTimeTimeZone = {
  dateTime?: string;
  timeZone?: string;
};

type GraphEventItem = {
  id?: string;
  subject?: string;
  showAs?: string;
  isCancelled?: boolean;
  start?: GraphDateTimeTimeZone;
  end?: GraphDateTimeTimeZone;
};

type GraphCalendarViewResponse = {
  value?: GraphEventItem[];
  "@odata.nextLink"?: string;
};

type GraphCreateEventResponse = {
  id?: string;
  subject?: string;
  start?: GraphDateTimeTimeZone;
  end?: GraphDateTimeTimeZone;
};

export class OutlookCalendarAdapter implements CalendarProvider {
  private cachedAccessToken: {
    token: string;
    expiresAtMs: number;
  } | null = null;

  constructor(
    private readonly config: OutlookCalendarConfig,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && now < this.cachedAccessToken.expiresAtMs) {
      return this.cachedAccessToken.token;
    }

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(
      this.config.tenantId,
    )}/oauth2/v2.0/token`;

    const bodyParams = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
      scope: "https://graph.microsoft.com/Calendars.ReadWrite",
    });

    let res: Response;
    try {
      res = await this.fetchFn(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: bodyParams.toString(),
      });
    } catch (err: unknown) {
      throw new CalendarProviderError({
        message: "Network failure while refreshing Microsoft OAuth token",
        provider: "outlook",
        operation: "refreshToken",
        cause: err,
      });
    }

    if (!res.ok) {
      throw new CalendarProviderError({
        message: "Microsoft Entra OAuth refresh token exchange failed",
        provider: "outlook",
        operation: "refreshToken",
        status: res.status,
      });
    }

    const data = (await res.json()) as MicrosoftTokenResponse;
    if (!data.access_token) {
      throw new CalendarProviderError({
        message: "Microsoft OAuth token response missing access_token",
        provider: "outlook",
        operation: "refreshToken",
      });
    }

    const expiresInSeconds = typeof data.expires_in === "number" ? data.expires_in : 3600;
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
        message: `No Outlook Calendar mapping found for dentist '${dentistId}'`,
        provider: "outlook",
        operation,
      });
    }

    return calendarId;
  }

  private formatGraphDateTimeToUtc(dateTimeObj?: GraphDateTimeTimeZone): string {
    if (!dateTimeObj?.dateTime) {
      throw new CalendarProviderError({
        message: "Microsoft Graph event missing dateTime value",
        provider: "outlook",
        operation: "getBusyIntervals",
      });
    }

    const raw = dateTimeObj.dateTime.trim();
    // If it already ends with Z or numeric offset, parse directly
    if (/Z|[+-]\d{2}:\d{2}$/i.test(raw)) {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        throw new CalendarProviderError({
          message: `Invalid date string in Microsoft Graph event: ${raw}`,
          provider: "outlook",
          operation: "getBusyIntervals",
        });
      }
      return parsed.toISOString();
    }

    // Graph formats floating dateTimes like "2026-10-25T09:30:00.0000000"
    const parsed = new Date(`${raw}Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new CalendarProviderError({
        message: `Invalid date string in Microsoft Graph event: ${raw}`,
        provider: "outlook",
        operation: "getBusyIntervals",
      });
    }
    return parsed.toISOString();
  }

  async getBusyIntervals(input: {
    dentistId: string;
    start: string;
    end: string;
  }): Promise<BusyInterval[]> {
    const normalizedWindow = normalizeCalendarInterval(input.start, input.end);
    const calendarId = this.resolveCalendarId(input.dentistId, "getBusyIntervals");
    const token = await this.getAccessToken();

    const queryParams = new URLSearchParams({
      startDateTime: normalizedWindow.start,
      endDateTime: normalizedWindow.end,
    });

    let nextUrl: string | undefined =
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(
        calendarId,
      )}/calendarView?${queryParams.toString()}`;

    const busyIntervals: BusyInterval[] = [];

    while (nextUrl) {
      let res: Response;
      try {
        res = await this.fetchFn(nextUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Prefer: 'outlook.timezone="UTC"',
          },
        });
      } catch (err: unknown) {
        throw new CalendarProviderError({
          message: "Network failure during Microsoft Graph calendarView query",
          provider: "outlook",
          operation: "getBusyIntervals",
          cause: err,
        });
      }

      if (!res.ok) {
        throw new CalendarProviderError({
          message: "Microsoft Graph calendarView API returned an error response",
          provider: "outlook",
          operation: "getBusyIntervals",
          status: res.status,
        });
      }

      const data = (await res.json()) as GraphCalendarViewResponse;
      const events = data.value ?? [];

      for (const event of events) {
        if (event.isCancelled === true) {
          continue;
        }

        if (event.showAs?.toLowerCase() === "free") {
          continue;
        }

        const startUtc = this.formatGraphDateTimeToUtc(event.start);
        const endUtc = this.formatGraphDateTimeToUtc(event.end);

        busyIntervals.push(normalizeCalendarInterval(startUtc, endUtc));
      }

      nextUrl = data["@odata.nextLink"];
    }

    return busyIntervals;
  }

  async createEvent(input: CalendarEventInput): Promise<CreatedCalendarEvent> {
    const normalizedInterval = normalizeCalendarInterval(input.start, input.end);
    const calendarId = this.resolveCalendarId(input.dentistId, "createEvent");
    const token = await this.getAccessToken();

    const url = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(
      calendarId,
    )}/events`;

    const requestBody = {
      subject: input.summary,
      body: {
        contentType: "Text",
        content: input.description,
      },
      start: {
        dateTime: normalizedInterval.start,
        timeZone: "UTC",
      },
      end: {
        dateTime: normalizedInterval.end,
        timeZone: "UTC",
      },
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
        message: "Network failure during Microsoft Graph event creation",
        provider: "outlook",
        operation: "createEvent",
        cause: err,
      });
    }

    if (!res.ok) {
      throw new CalendarProviderError({
        message: "Microsoft Graph event creation API returned an error response",
        provider: "outlook",
        operation: "createEvent",
        status: res.status,
      });
    }

    const data = (await res.json()) as GraphCreateEventResponse;
    if (!data.id) {
      throw new CalendarProviderError({
        message: "Microsoft Graph event creation did not return an event ID",
        provider: "outlook",
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
