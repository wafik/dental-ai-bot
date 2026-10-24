import { describe, expect, it } from "bun:test";
import {
  CalendarProviderError,
  type CalendarProvider,
  type CalendarEventInput,
  type CreatedCalendarEvent,
  type BusyInterval,
  normalizeCalendarInterval,
} from "../src/providers/calendar/calendar-provider";
import { CalendarProviderError as SeparatedCalendarProviderError } from "../src/providers/calendar/calendar-error";

describe("CalendarProviderError", () => {
  it("creates an error with provider, operation, and status metadata", () => {
    const error = new CalendarProviderError({
      message: "Failed to exchange refresh token",
      provider: "google",
      operation: "refreshToken",
      status: 401,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CalendarProviderError);
    expect(error.name).toBe("CalendarProviderError");
    expect(error.message).toBe("Failed to exchange refresh token");
    expect(error.provider).toBe("google");
    expect(error.operation).toBe("refreshToken");
    expect(error.status).toBe(401);
  });

  it("can be imported from calendar-error.ts as well", () => {
    const error = new SeparatedCalendarProviderError({
      message: "Outlook calendar error",
      provider: "outlook",
      operation: "getBusyIntervals",
    });

    expect(error.provider).toBe("outlook");
    expect(error.operation).toBe("getBusyIntervals");
    expect(error.status).toBeUndefined();
  });
});

describe("normalizeCalendarInterval", () => {
  it("normalizes valid UTC timestamps with explicit Z suffix", () => {
    const start = "2026-10-25T09:00:00.000Z";
    const end = "2026-10-25T10:00:00.000Z";

    const normalized = normalizeCalendarInterval(start, end);

    expect(normalized).toEqual({
      start: "2026-10-25T09:00:00.000Z",
      end: "2026-10-25T10:00:00.000Z",
    });
  });

  it("converts valid numeric UTC offsets into canonical UTC ISO strings with Z", () => {
    const start = "2026-10-25T16:00:00+07:00"; // 09:00:00Z
    const end = "2026-10-25T17:00:00+07:00"; // 10:00:00Z

    const normalized = normalizeCalendarInterval(start, end);

    expect(normalized.start).toBe("2026-10-25T09:00:00.000Z");
    expect(normalized.end).toBe("2026-10-25T10:00:00.000Z");
  });

  it("rejects timestamps without an explicit UTC offset or Z indicator", () => {
    expect(() => {
      normalizeCalendarInterval("2026-10-25T09:00:00", "2026-10-25T10:00:00Z");
    }).toThrow(/timezone|offset|RFC3339/i);

    expect(() => {
      normalizeCalendarInterval("2026-10-25T09:00:00Z", "2026-10-25T10:00:00");
    }).toThrow(/timezone|offset|RFC3339/i);
  });

  it("rejects invalid date strings", () => {
    expect(() => {
      normalizeCalendarInterval("not-a-date", "2026-10-25T10:00:00Z");
    }).toThrow(/invalid/i);

    expect(() => {
      normalizeCalendarInterval("2026-02-31T09:00:00Z", "2026-02-31T10:00:00Z");
    }).toThrow(/invalid/i);
  });

  it("rejects intervals where start is equal to or after end", () => {
    const same = "2026-10-25T10:00:00.000Z";
    expect(() => {
      normalizeCalendarInterval(same, same);
    }).toThrow(/start must be before end/i);

    const start = "2026-10-25T11:00:00.000Z";
    const end = "2026-10-25T10:00:00.000Z";
    expect(() => {
      normalizeCalendarInterval(start, end);
    }).toThrow(/start must be before end/i);
  });
});

describe("CalendarProvider contract type check", () => {
  it("allows implementing a compliant fake calendar provider", async () => {
    class FakeProvider implements CalendarProvider {
      async getBusyIntervals(input: {
        dentistId: string;
        start: string;
        end: string;
      }): Promise<BusyInterval[]> {
        const interval = normalizeCalendarInterval(input.start, input.end);
        return [interval];
      }

      async createEvent(input: CalendarEventInput): Promise<CreatedCalendarEvent> {
        const interval = normalizeCalendarInterval(input.start, input.end);
        return {
          id: `evt-${input.dentistId}`,
          start: interval.start,
          end: interval.end,
        };
      }
    }

    const provider: CalendarProvider = new FakeProvider();
    const busy = await provider.getBusyIntervals({
      dentistId: "senior-1",
      start: "2026-10-25T09:00:00Z",
      end: "2026-10-25T10:00:00Z",
    });

    expect(busy).toHaveLength(1);
    expect(busy[0]?.start).toBe("2026-10-25T09:00:00.000Z");

    const event = await provider.createEvent({
      dentistId: "senior-1",
      summary: "Cleaning",
      description: "Routine checkup",
      start: "2026-10-25T11:00:00Z",
      end: "2026-10-25T12:00:00Z",
    });

    expect(event.id).toBe("evt-senior-1");
    expect(event.start).toBe("2026-10-25T11:00:00.000Z");
  });
});
