import { describe, expect, it, mock } from "bun:test";
import { GoogleCalendarAdapter } from "../src/providers/calendar/google-calendar-adapter";
import { OutlookCalendarAdapter } from "../src/providers/calendar/outlook-calendar-adapter";
import type { CalendarProvider } from "../src/providers/calendar/calendar-provider";
import type { GoogleCalendarConfig, OutlookCalendarConfig } from "../src/config/calendar";

describe("CalendarProvider Parity Contract", () => {
  const googleConfig: GoogleCalendarConfig = {
    clientId: "mock-g-client",
    clientSecret: "mock-g-secret",
    refreshToken: "mock-g-refresh",
    calendarIds: {
      junior: "g-junior-cal",
      "senior-1": "g-senior1-cal",
      "senior-2": "g-senior2-cal",
    },
  };

  const outlookConfig: OutlookCalendarConfig = {
    tenantId: "mock-ms-tenant",
    clientId: "mock-ms-client",
    clientSecret: "mock-ms-secret",
    refreshToken: "mock-ms-refresh",
    calendarIds: {
      junior: "ms-junior-cal",
      "senior-1": "ms-senior1-cal",
      "senior-2": "ms-senior2-cal",
    },
  };

  it("both adapters return identical BusyInterval[] shapes for equivalent schedule busy data", async () => {
    const mockGoogleFetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          kind: "calendar#freeBusy",
          calendars: {
            "g-junior-cal": {
              busy: [
                { start: "2026-10-25T09:00:00Z", end: "2026-10-25T10:00:00Z" },
                { start: "2026-10-25T14:00:00+00:00", end: "2026-10-25T15:00:00+00:00" },
              ],
            },
          },
        }),
        { status: 200 },
      );
    });

    const mockOutlookFetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("login.microsoftonline.com")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          value: [
            {
              id: "evt-1",
              showAs: "busy",
              isCancelled: false,
              start: { dateTime: "2026-10-25T09:00:00.0000000", timeZone: "UTC" },
              end: { dateTime: "2026-10-25T10:00:00.0000000", timeZone: "UTC" },
            },
            {
              id: "evt-2",
              showAs: "busy",
              isCancelled: false,
              start: { dateTime: "2026-10-25T14:00:00.0000000", timeZone: "UTC" },
              end: { dateTime: "2026-10-25T15:00:00.0000000", timeZone: "UTC" },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const googleProvider: CalendarProvider = new GoogleCalendarAdapter(
      googleConfig,
      mockGoogleFetch as unknown as typeof fetch,
    );
    const outlookProvider: CalendarProvider = new OutlookCalendarAdapter(
      outlookConfig,
      mockOutlookFetch as unknown as typeof fetch,
    );

    const input = {
      dentistId: "junior",
      start: "2026-10-25T08:00:00Z",
      end: "2026-10-25T18:00:00Z",
    };

    const googleBusy = await googleProvider.getBusyIntervals(input);
    const outlookBusy = await outlookProvider.getBusyIntervals(input);

    expect(googleBusy).toEqual([
      { start: "2026-10-25T09:00:00.000Z", end: "2026-10-25T10:00:00.000Z" },
      { start: "2026-10-25T14:00:00.000Z", end: "2026-10-25T15:00:00.000Z" },
    ]);

    expect(outlookBusy).toEqual(googleBusy);
  });

  it("both adapters return identical CreatedCalendarEvent shapes with UTC timestamps", async () => {
    const mockGoogleFetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          id: "common-event-id",
          start: { dateTime: "2026-10-25T10:00:00Z" },
          end: { dateTime: "2026-10-25T11:00:00Z" },
        }),
        { status: 200 },
      );
    });

    const mockOutlookFetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("login.microsoftonline.com")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          id: "common-event-id",
          start: { dateTime: "2026-10-25T10:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2026-10-25T11:00:00.0000000", timeZone: "UTC" },
        }),
        { status: 201 },
      );
    });

    const googleProvider: CalendarProvider = new GoogleCalendarAdapter(
      googleConfig,
      mockGoogleFetch as unknown as typeof fetch,
    );
    const outlookProvider: CalendarProvider = new OutlookCalendarAdapter(
      outlookConfig,
      mockOutlookFetch as unknown as typeof fetch,
    );

    const eventInput = {
      dentistId: "senior-1",
      summary: "Cleaning",
      description: "Routine check",
      start: "2026-10-25T10:00:00Z",
      end: "2026-10-25T11:00:00Z",
    };

    const googleCreated = await googleProvider.createEvent(eventInput);
    const outlookCreated = await outlookProvider.createEvent(eventInput);

    expect(googleCreated).toEqual({
      id: "common-event-id",
      start: "2026-10-25T10:00:00.000Z",
      end: "2026-10-25T11:00:00.000Z",
    });

    expect(outlookCreated).toEqual(googleCreated);
  });
});
