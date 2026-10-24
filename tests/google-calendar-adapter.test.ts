import { describe, expect, it, mock } from "bun:test";
import { GoogleCalendarAdapter } from "../src/providers/calendar/google-calendar-adapter";
import { CalendarProviderError } from "../src/providers/calendar/calendar-error";
import type { GoogleCalendarConfig } from "../src/config/calendar";

describe("GoogleCalendarAdapter", () => {
  const dummyConfig: GoogleCalendarConfig = {
    clientId: "mock-google-client-id",
    clientSecret: "mock-google-client-secret",
    refreshToken: "mock-google-refresh-token",
    calendarIds: {
      junior: "junior-calendar@group.calendar.google.com",
      "senior-1": "senior-1-calendar@group.calendar.google.com",
      "senior-2": "senior-2-calendar@group.calendar.google.com",
    },
  };

  const createMockFetch = (handlers: {
    tokenHandler?: (req: Request) => Promise<Response>;
    apiHandler?: (req: Request) => Promise<Response>;
  }) => {
    return mock(async (input: string | URL | Request, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const url = req.url;

      if (url.includes("oauth2.googleapis.com/token")) {
        if (handlers.tokenHandler) {
          return handlers.tokenHandler(req);
        }
        return new Response(
          JSON.stringify({
            access_token: "mock-google-access-token",
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
    it("exchanges refresh token with correct parameters and caches the access token", async () => {
      let tokenCallCount = 0;
      let tokenRequestBody = "";

      const mockFetch = createMockFetch({
        tokenHandler: async (req) => {
          tokenCallCount++;
          tokenRequestBody = await req.text();
          return new Response(
            JSON.stringify({
              access_token: "cached-token-123",
              expires_in: 3600,
              token_type: "Bearer",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
        apiHandler: async () => {
          return new Response(
            JSON.stringify({
              kind: "calendar#freeBusy",
              calendars: {
                "senior-1-calendar@group.calendar.google.com": {
                  busy: [],
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      });

      const adapter = new GoogleCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      // First call should perform token exchange
      await adapter.getBusyIntervals({
        dentistId: "senior-1",
        start: "2026-10-25T09:00:00Z",
        end: "2026-10-25T10:00:00Z",
      });

      expect(tokenCallCount).toBe(1);
      const params = new URLSearchParams(tokenRequestBody);
      expect(params.get("grant_type")).toBe("refresh_token");
      expect(params.get("client_id")).toBe("mock-google-client-id");
      expect(params.get("client_secret")).toBe("mock-google-client-secret");
      expect(params.get("refresh_token")).toBe("mock-google-refresh-token");

      // Second call should reuse cached access token
      await adapter.getBusyIntervals({
        dentistId: "senior-1",
        start: "2026-10-25T11:00:00Z",
        end: "2026-10-25T12:00:00Z",
      });

      expect(tokenCallCount).toBe(1);
    });

    it("throws CalendarProviderError if token exchange fails with non-ok response", async () => {
      const mockFetch = createMockFetch({
        tokenHandler: async () => {
          return new Response(
            JSON.stringify({ error: "invalid_grant", error_description: "Bad token" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        },
      });

      const adapter = new GoogleCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

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
    it("queries Freebusy endpoint with correct body and headers, returning normalized busy intervals", async () => {
      let capturedUrl = "";
      let capturedAuthHeader = "";
      let capturedBody: unknown = null;

      const mockFetch = createMockFetch({
        apiHandler: async (req) => {
          capturedUrl = req.url;
          capturedAuthHeader = req.headers.get("Authorization") ?? "";
          capturedBody = await req.json();

          return new Response(
            JSON.stringify({
              kind: "calendar#freeBusy",
              timeMin: "2026-10-25T09:00:00.000Z",
              timeMax: "2026-10-25T12:00:00.000Z",
              calendars: {
                "senior-1-calendar@group.calendar.google.com": {
                  busy: [
                    {
                      start: "2026-10-25T09:30:00Z",
                      end: "2026-10-25T10:30:00Z",
                    },
                  ],
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      });

      const adapter = new GoogleCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      const busy = await adapter.getBusyIntervals({
        dentistId: "senior-1",
        start: "2026-10-25T09:00:00Z",
        end: "2026-10-25T12:00:00Z",
      });

      expect(capturedUrl).toBe("https://www.googleapis.com/calendar/v3/freeBusy");
      expect(capturedAuthHeader).toBe("Bearer mock-google-access-token");
      expect(capturedBody).toEqual({
        timeMin: "2026-10-25T09:00:00.000Z",
        timeMax: "2026-10-25T12:00:00.000Z",
        items: [{ id: "senior-1-calendar@group.calendar.google.com" }],
      });

      expect(busy).toEqual([
        {
          start: "2026-10-25T09:30:00.000Z",
          end: "2026-10-25T10:30:00.000Z",
        },
      ]);
    });

    it("throws CalendarProviderError if dentistId mapping is missing without making HTTP calls", async () => {
      const mockFetch = mock(async () => new Response("ok"));
      const adapter = new GoogleCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      try {
        await adapter.getBusyIntervals({
          dentistId: "unknown-dentist",
          start: "2026-10-25T09:00:00Z",
          end: "2026-10-25T10:00:00Z",
        });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CalendarProviderError);
        const providerError = err as CalendarProviderError;
        expect(providerError.provider).toBe("google");
        expect(providerError.operation).toBe("getBusyIntervals");
        expect(mockFetch).not.toHaveBeenCalled();
      }
    });

    it("throws CalendarProviderError if calendar response contains in-body errors", async () => {
      const mockFetch = createMockFetch({
        apiHandler: async () => {
          return new Response(
            JSON.stringify({
              kind: "calendar#freeBusy",
              calendars: {
                "junior-calendar@group.calendar.google.com": {
                  errors: [{ domain: "calendar", reason: "notFound" }],
                  busy: [],
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      });

      const adapter = new GoogleCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      expect(
        adapter.getBusyIntervals({
          dentistId: "junior",
          start: "2026-10-25T09:00:00Z",
          end: "2026-10-25T10:00:00Z",
        }),
      ).rejects.toThrow(CalendarProviderError);
    });
  });

  describe("createEvent", () => {
    it("creates an event at the encoded calendar endpoint and returns created event details", async () => {
      let capturedUrl = "";
      let capturedBody: unknown = null;

      const mockFetch = createMockFetch({
        apiHandler: async (req) => {
          capturedUrl = req.url;
          capturedBody = await req.json();

          return new Response(
            JSON.stringify({
              id: "google-evt-789",
              start: { dateTime: "2026-10-25T10:00:00Z" },
              end: { dateTime: "2026-10-25T11:00:00Z" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      });

      const adapter = new GoogleCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      const created = await adapter.createEvent({
        dentistId: "senior-2",
        summary: "Root Canal Treatment",
        description: "Patient checkup and canal therapy",
        start: "2026-10-25T10:00:00Z",
        end: "2026-10-25T11:00:00Z",
      });

      const encodedCalendarId = encodeURIComponent("senior-2-calendar@group.calendar.google.com");
      expect(capturedUrl).toBe(
        `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events`,
      );

      expect(capturedBody).toEqual({
        summary: "Root Canal Treatment",
        description: "Patient checkup and canal therapy",
        start: { dateTime: "2026-10-25T10:00:00.000Z" },
        end: { dateTime: "2026-10-25T11:00:00.000Z" },
      });

      expect(created).toEqual({
        id: "google-evt-789",
        start: "2026-10-25T10:00:00.000Z",
        end: "2026-10-25T11:00:00.000Z",
      });
    });

    it("throws CalendarProviderError if API returns HTTP error on event insertion", async () => {
      const mockFetch = createMockFetch({
        apiHandler: async () => {
          return new Response(JSON.stringify({ error: { code: 403, message: "Forbidden" } }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        },
      });

      const adapter = new GoogleCalendarAdapter(dummyConfig, mockFetch as unknown as typeof fetch);

      try {
        await adapter.createEvent({
          dentistId: "junior",
          summary: "Checkup",
          description: "Routine check",
          start: "2026-10-25T10:00:00Z",
          end: "2026-10-25T11:00:00Z",
        });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CalendarProviderError);
        const providerError = err as CalendarProviderError;
        expect(providerError.provider).toBe("google");
        expect(providerError.operation).toBe("createEvent");
        expect(providerError.status).toBe(403);
      }
    });
  });
});
