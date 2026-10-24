import type {
  BusyInterval,
  CalendarEventInput,
  CalendarProvider,
  CreatedCalendarEvent,
} from "./calendar-provider";

/**
 * Fallback no-op calendar provider used for local development, testing,
 * and offline environments where external calendar credentials are not set.
 */
export class NoopCalendarProvider implements CalendarProvider {
  async getBusyIntervals(): Promise<BusyInterval[]> {
    return [];
  }

  async createEvent(input: CalendarEventInput): Promise<CreatedCalendarEvent> {
    return {
      id: `mock-evt-${Date.now()}`,
      start: input.start,
      end: input.end,
    };
  }
}
