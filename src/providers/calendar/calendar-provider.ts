import {
  CalendarProviderError,
  type CalendarProviderName,
  type CalendarOperation,
  type CalendarProviderErrorOptions,
} from "./calendar-error";

export {
  CalendarProviderError,
  type CalendarProviderName,
  type CalendarOperation,
  type CalendarProviderErrorOptions,
};

/**
 * A normalized busy interval with canonical UTC ISO timestamps.
 */
export type BusyInterval = {
  start: string;
  end: string;
};

/**
 * Input required to create a new appointment calendar event.
 */
export type CalendarEventInput = {
  dentistId: string;
  summary: string;
  description: string;
  start: string;
  end: string;
};

/**
 * Result returned after creating an appointment event.
 */
export type CreatedCalendarEvent = {
  id: string;
  start: string;
  end: string;
};

/**
 * Provider-neutral contract for calendar operations.
 */
export type CalendarProvider = {
  getBusyIntervals(input: {
    dentistId: string;
    start: string;
    end: string;
  }): Promise<BusyInterval[]>;

  createEvent(input: CalendarEventInput): Promise<CreatedCalendarEvent>;
};

const RFC3339_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;

function parseAndValidateRfc3339(value: string): Date {
  const match = RFC3339_REGEX.exec(value);
  if (!match) {
    throw new Error(
      `Invalid RFC3339 timestamp '${value}': must include an explicit UTC offset or 'Z' indicator.`,
    );
  }

  const yearStr = match[1];
  const monthStr = match[2];
  const dayStr = match[3];
  const hourStr = match[4];
  const minuteStr = match[5];
  const secondStr = match[6];

  if (!yearStr || !monthStr || !dayStr || !hourStr || !minuteStr || !secondStr) {
    throw new Error(`Invalid RFC3339 timestamp '${value}': incomplete date or time components.`);
  }

  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);
  const hour = Number.parseInt(hourStr, 10);
  const minute = Number.parseInt(minuteStr, 10);
  const second = Number.parseInt(secondStr, 10);

  if (month < 1 || month > 12) {
    throw new Error(`Invalid month in timestamp '${value}'.`);
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) {
    throw new Error(`Invalid calendar date in timestamp '${value}'.`);
  }

  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Invalid time in timestamp '${value}'.`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid timestamp string '${value}'.`);
  }

  return parsed;
}

/**
 * Normalizes start and end timestamps into canonical RFC3339 UTC strings with 'Z' suffix.
 * Enforces strict RFC3339 format, real calendar dates, and start < end.
 */
export function normalizeCalendarInterval(start: string, end: string): BusyInterval {
  const startDate = parseAndValidateRfc3339(start);
  const endDate = parseAndValidateRfc3339(end);

  if (startDate.getTime() >= endDate.getTime()) {
    throw new Error(`Invalid calendar interval: start must be before end (${start} >= ${end}).`);
  }

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}
