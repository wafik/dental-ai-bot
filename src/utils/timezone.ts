import type { Appointment } from "../domain/scheduling";
import type { BusyInterval } from "../providers/calendar/calendar-provider";

export const DEFAULT_CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || "Asia/Jakarta";

/**
 * Converts a clinic local date (YYYY-MM-DD) and time (HH:mm) in a given timeZone
 * to a canonical RFC3339 UTC string with trailing 'Z'.
 */
export function localToUtcIso(
  dateStr: string,
  timeStr: string,
  timeZone: string = DEFAULT_CLINIC_TIMEZONE,
): string {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const [hourStr, minuteStr] = timeStr.split(":");

  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  // Initial candidate as UTC
  const utcCandidate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  // Determine wall-clock time representation of utcCandidate in target timeZone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(utcCandidate).map((p) => [p.type, p.value]),
  );

  const localYear = Number(parts.year);
  const localMonth = Number(parts.month);
  const localDay = Number(parts.day);
  const localHour = parts.hour === "24" ? 0 : Number(parts.hour);
  const localMinute = Number(parts.minute);

  const localAsUtc = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0);
  const offsetMs = localAsUtc - utcCandidate.getTime();

  const targetUtc = new Date(utcCandidate.getTime() - offsetMs);
  return targetUtc.toISOString();
}

/**
 * Converts a UTC timestamp into the clinic local date (YYYY-MM-DD) and time (HH:mm).
 */
export function utcToLocalParts(
  isoString: string,
  timeZone: string = DEFAULT_CLINIC_TIMEZONE,
): { date: string; time: string } {
  const dateObj = new Date(isoString);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(formatter.formatToParts(dateObj).map((p) => [p.type, p.value]));

  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  };
}

/**
 * Converts an external calendar UTC busy interval into a local appointment format
 * suitable for `findAvailableSlots` scheduling logic on `targetDate`.
 * Returns null if the busy interval does not intersect the targetDate.
 */
export function utcBusyIntervalToLocalAppointment(
  busy: BusyInterval,
  dentistId: string,
  targetDate: string,
  timeZone: string = DEFAULT_CLINIC_TIMEZONE,
): Appointment | null {
  const startParts = utcToLocalParts(busy.start, timeZone);
  const endParts = utcToLocalParts(busy.end, timeZone);

  // If the interval ends on or before the target date starts, or starts on or after the target date ends
  if (endParts.date < targetDate || startParts.date > targetDate) {
    return null;
  }

  // Bound start and end to the target date's bounds
  let localStart = startParts.date === targetDate ? startParts.time : "00:00";
  let localEnd = endParts.date === targetDate ? endParts.time : "23:59";

  // If interval crosses midnight or ends at 00:00 of the next day
  if (endParts.date > targetDate) {
    localEnd = "23:59";
  }

  // Safety check: localStart must be strictly before localEnd
  if (localStart >= localEnd) {
    return null;
  }

  return {
    date: targetDate,
    dentistId,
    start: localStart,
    end: localEnd,
  };
}
