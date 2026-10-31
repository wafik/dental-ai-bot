import { describe, expect, it, mock } from "bun:test";
import { OutlookCalendarAdapter } from "../src/providers/calendar/outlook-calendar-adapter";
import { CalendarProviderError } from "../src/providers/calendar/calendar-error";
import type { OutlookCalendarConfig } from "../src/config/calendar";

describe("OutlookCalendarAdapter", () => {
  const dummyConfig: OutlookCalendarConfig = {
    tenantId: "mock-tenant-id",
    clientId: "mock-client-id",
    clientSecret: "mock-client-secret",
    refreshToken: "mock-refresh-token",
    calendarIds: {
      junior: "junior-calendar-id",
      "senior-1": "senior-1-calendar-id",
      "senior-2": "senior-2-calendar-id",
    },
  };

  const createMockFetch = (handlers: {
    tokenHandler?: (req: Request) => Promise<Response>;
    apiHandler?: (req: Request) => Promise<Response>;
  }) => {
    return mock(async (input: string | URL | Request, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const url = req.url;

      if (url.includes("login.microsoftonline.com")) {
        if (handlers.tokenHandler) {
          return handlers.tokenHandler(req);
        }
        return new Response(
          JSON.stringify({
            access_token: "mock-graph-access-token",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (handlers.apiHandler) {
        return handlers.apiHandler(req);
      }

      return new Response("Not Found", { status: 404 });
    });
  };

  describe("Token Exchange & Caching", () => {
    it("exchanges refresh token with resource scope only (excluding offline_access) and caches access token", async () => {
      let tokenCallCount = 0;
      let tokenRequestBody = "";

      const mockFetch = createMockFetch({
        tokenHandler: async (req) => {
          tokenCallCount++;
          tokenRequestBody = await req.text();
          return new Response(
            JSON.stringify({
              access_token: "cached-ms-token-456",
              expires_in: 3600,
              token_type: "Bearer",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
        apiHandler: async () => {
          return new Response(
            JSON.stringify({
              value: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      });

      const adapter = new OutlookCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      await adapter.getBusyIntervals({
        dentistId: "junior",
        start: "2026-10-25T09:00:00Z",
        end: "2026-10-25T10:00:00Z",
      });

      expect(tokenCallCount).toBe(1);
      const params = new URLSearchParams(tokenRequestBody);
      expect(params.get("grant_type")).toBe("refresh_token");
      expect(params.get("client_id")).toBe("mock-client-id");
      expect(params.get("client_secret")).toBe("mock-client-secret");
      expect(params.get("refresh_token")).toBe("mock-refresh-token");
      expect(params.get("scope")).toBe("https://graph.microsoft.com/Calendars.ReadWrite");
      expect(params.get("scope")).not.toContain("offline_access");

      // Second call within lifetime reuses token
      await adapter.getBusyIntervals({
        dentistId: "junior",
        start: "2026-10-25T10:00:00Z",
        end: "2026-10-25T11:00:00Z",
      });

      expect(tokenCallCount).toBe(1);
    });

    it("throws CalendarProviderError if token exchange fails", async () => {
      const mockFetch = createMockFetch({
        tokenHandler: async () => {
          return new Response(
            JSON.stringify({ error: "invalid_grant", error_description: "Expired token" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        },
      });

      const adapter = new OutlookCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      expect(
        adapter.getBusyIntervals({
          dentistId: "junior",
          start: "2026-10-25T09:00:00Z",
          end: "2026-10-25T10:00:00Z",
        }),
      ).rejects.toThrow(CalendarProviderError);
    });
  });

  describe("getBusyIntervals", () => {
    it("requests calendarView with Prefer timezone header and converts Graph timestamps", async () => {
      let capturedUrl = "";
      let capturedPrefer = "";
      let capturedAuth = "";

      const mockFetch = createMockFetch({
        apiHandler: async (req) => {
          capturedUrl = req.url;
          capturedPrefer = req.headers.get("Prefer") ?? "";
          capturedAuth = req.headers.get("Authorization") ?? "";

          return new Response(
            JSON.stringify({
              value: [
                {
                  id: "evt-1",
                  subject: "Dentist appointment",
                  showAs: "busy",
                  isCancelled: false,
                  start: {
                    dateTime: "2026-10-25T09:30:00.0000000",
                    timeZone: "UTC",
                  },
                  end: {
                    dateTime: "2026-10-25T10:30:00.0000000",
                    timeZone: "UTC",
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      });

      const adapter = new OutlookCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      const busy = await adapter.getBusyIntervals({
        dentistId: "senior-1",
        start: "2026-10-25T09:00:00Z",
        end: "2026-10-25T12:00:00Z",
      });

      const expectedBase =
        "https://graph.microsoft.com/v1.0/me/calendars/senior-1-calendar-id/calendarView";
      expect(capturedUrl.startsWith(expectedBase)).toBe(true);
      expect(capturedUrl).toContain("startDateTime=");
      expect(capturedUrl).toContain("endDateTime=");
      expect(capturedPrefer).toBe('outlook.timezone="UTC"');
      expect(capturedAuth).toBe("Bearer mock-graph-access-token");

      expect(busy).toEqual([
        {
          start: "2026-10-25T09:30:00.000Z",
          end: "2026-10-25T10:30:00.000Z",
        },
      ]);
    });

    it("handles multi-page calendarView pagination via @odata.nextLink", async () => {
      const pageRequests: string[] = [];

      const mockFetch = createMockFetch({
        apiHandler: async (req) => {
          pageRequests.push(req.url);

          if (req.url.includes("$skip=10")) {
            // Page 2
            return new Response(
              JSON.stringify({
                value: [
                  {
                    id: "evt-page-2",
                    showAs: "busy",
                    isCancelled: false,
                    start: { dateTime: "2026-10-25T11:00:00.0000000", timeZone: "UTC" },
                    end: { dateTime: "2026-10-25T11:30:00.0000000", timeZone: "UTC" },
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          // Page 1
          return new Response(
            JSON.stringify({
              "@odata.nextLink":
                "https://graph.microsoft.com/v1.0/me/calendars/senior-1-calendar-id/calendarView?$skip=10",
              value: [
                {
                  id: "evt-page-1",
                  showAs: "busy",
                  isCancelled: false,
                  start: { dateTime: "2026-10-25T09:00:00.0000000", timeZone: "UTC" },
                  end: { dateTime: "2026-10-25T09:45:00.0000000", timeZone: "UTC" },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      });

      const adapter = new OutlookCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      const busy = await adapter.getBusyIntervals({
        dentistId: "senior-1",
        start: "2026-10-25T09:00:00Z",
        end: "2026-10-25T12:00:00Z",
      });

      expect(pageRequests).toHaveLength(2);
      expect(busy).toEqual([
        {
          start: "2026-10-25T09:00:00.000Z",
          end: "2026-10-25T09:45:00.000Z",
        },
        {
          start: "2026-10-25T11:00:00.000Z",
          end: "2026-10-25T11:30:00.000Z",
        },
      ]);
    });

    it("filters out cancelled events and events with showAs: 'free'", async () => {
      const mockFetch = createMockFetch({
        apiHandler: async () => {
          return new Response(
            JSON.stringify({
              value: [
                {
                  id: "free-event",
                  showAs: "free",
                  isCancelled: false,
                  start: { dateTime: "2026-10-25T09:00:00.0000000", timeZone: "UTC" },
                  end: { dateTime: "2026-10-25T10:00:00.0000000", timeZone: "UTC" },
                },
                {
                  id: "cancelled-event",
                  showAs: "busy",
                  isCancelled: true,
                  start: { dateTime: "2026-10-25T10:00:00.0000000", timeZone: "UTC" },
                  end: { dateTime: "2026-10-25T11:00:00.0000000", timeZone: "UTC" },
                },
                {
                  id: "tentative-event",
                  showAs: "tentative",
                  isCancelled: false,
                  start: { dateTime: "2026-10-25T11:00:00.0000000", timeZone: "UTC" },
                  end: { dateTime: "2026-10-25T12:00:00.0000000", timeZone: "UTC" },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      });

      const adapter = new OutlookCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      const busy = await adapter.getBusyIntervals({
        dentistId: "senior-2",
        start: "2026-10-25T09:00:00Z",
        end: "2026-10-25T12:00:00Z",
      });

      expect(busy).toEqual([
        {
          start: "2026-10-25T11:00:00.000Z",
          end: "2026-10-25T12:00:00.000Z",
        },
      ]);
    });

    it("throws CalendarProviderError if dentistId mapping is missing without making HTTP calls", async () => {
      const mockFetch = mock(async () => new Response("ok"));
      const adapter = new OutlookCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      try {
        await adapter.getBusyIntervals({
          dentistId: "nonexistent-dentist",
          start: "2026-10-25T09:00:00Z",
          end: "2026-10-25T10:00:00Z",
        });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CalendarProviderError);
        const providerError = err as CalendarProviderError;
        expect(providerError.provider).toBe("outlook");
        expect(providerError.operation).toBe("getBusyIntervals");
        expect(mockFetch).not.toHaveBeenCalled();
      }
    });
  });

  describe("createEvent", () => {
    it("creates an event mapping summary to subject, description to body, and timestamps to dateTimeTimeZone", async () => {
      let capturedUrl = "";
      let capturedBody: unknown = null;

      const mockFetch = createMockFetch({
        apiHandler: async (req) => {
          capturedUrl = req.url;
          capturedBody = await req.json();

          return new Response(
            JSON.stringify({
              id: "ms-evt-999",
              subject: "Dental Crown",
              start: { dateTime: "2026-10-25T14:00:00.0000000", timeZone: "UTC" },
              end: { dateTime: "2026-10-25T16:00:00.0000000", timeZone: "UTC" },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        },
      });

      const adapter = new OutlookCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      const created = await adapter.createEvent({
        dentistId: "senior-1",
        summary: "Dental Crown",
        description: "Crown preparation and fit",
        start: "2026-10-25T14:00:00Z",
        end: "2026-10-25T16:00:00Z",
      });

      expect(capturedUrl).toBe(
        "https://graph.microsoft.com/v1.0/me/calendars/senior-1-calendar-id/events",
      );

      expect(capturedBody).toEqual({
        subject: "Dental Crown",
        body: {
          contentType: "Text",
          content: "Crown preparation and fit",
        },
        start: {
          dateTime: "2026-10-25T14:00:00.000Z",
          timeZone: "UTC",
        },
        end: {
          dateTime: "2026-10-25T16:00:00.000Z",
          timeZone: "UTC",
        },
      });

      expect(created).toEqual({
        id: "ms-evt-999",
        start: "2026-10-25T14:00:00.000Z",
        end: "2026-10-25T16:00:00.000Z",
      });
    });

    it("throws CalendarProviderError on Graph API event creation failure", async () => {
      const mockFetch = createMockFetch({
        apiHandler: async () => {
          return new Response(
            JSON.stringify({ error: { code: "ErrorItemNotFound", message: "Calendar not found" } }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        },
      });

      const adapter = new OutlookCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      expect(
        adapter.createEvent({
          dentistId: "junior",
          summary: "Checkup",
          description: "Routine check",
          start: "2026-10-25T14:00:00Z",
          end: "2026-10-25T15:00:00Z",
        }),
      ).rejects.toThrow(CalendarProviderError);
    });
  });

  describe("deleteEvent", () => {
    it("deletes the encoded event and resolves", async () => {
      let capturedUrl = "";
      let capturedMethod = "";

      const mockFetch = createMockFetch({
        apiHandler: async (req) => {
          capturedUrl = req.url;
          capturedMethod = req.method;
          return new Response(null, { status: 204 });
        },
      });

      const adapter = new OutlookCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);
      await adapter.deleteEvent({ dentistId: "senior-1", eventId: "AAMk/with+slash" });

      expect(capturedMethod).toBe("DELETE");
      expect(capturedUrl).toBe(
        `https://graph.microsoft.com/v1.0/me/calendars/senior-1-calendar-id/events/${encodeURIComponent("AAMk/with+slash")}`,
      );
    });

    it("treats HTTP 404 as an already-deleted success", async () => {
      const mockFetch = createMockFetch({
        apiHandler: async () => new Response("Not Found", { status: 404 }),
      });

      const adapter = new OutlookCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);
      await expect(
        adapter.deleteEvent({ dentistId: "junior", eventId: "missing" }),
      ).resolves.toBeUndefined();
    });

    it("throws a redacted CalendarProviderError on other failures", async () => {
      const mockFetch = createMockFetch({
        apiHandler: async () => new Response("denied: raw body detail", { status: 403 }),
      });

      const adapter = new OutlookCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      try {
        await adapter.deleteEvent({ dentistId: "junior", eventId: "evt-1" });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CalendarProviderError);
        const providerError = err as CalendarProviderError;
        expect(providerError.provider).toBe("outlook");
        expect(providerError.operation).toBe("deleteEvent");
        expect(providerError.status).toBe(403);
        expect(providerError.message).not.toContain("raw body detail");
      }
    });
  });
});
