import type { CalendarProviderName } from "../providers/calendar/calendar-provider";

/** External calendar work tracked per appointment and provider. */
export type CalendarSyncOperation = "book" | "cancel";

/**
 * - `pending`: not yet applied at the provider; retried with backoff.
 * - `succeeded`: the provider applied the operation.
 * - `needs_manual_reconciliation`: the outcome is unknown (or retries were
 *   exhausted), and retrying could duplicate the event.
 */
export type CalendarSyncStatus = "pending" | "succeeded" | "needs_manual_reconciliation";

export type AppointmentCalendarSync = {
  appointmentId: string;
  provider: CalendarProviderName;
  operation: CalendarSyncOperation;
  status: CalendarSyncStatus;
  eventId?: string;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
  updatedAt: string;
};

/** Fields an update may change. A null clears the stored value. */
export type CalendarSyncPatch = {
  operation?: CalendarSyncOperation;
  status?: CalendarSyncStatus;
  eventId?: string | null;
  attempts?: number;
  lastError?: string | null;
  nextAttemptAt?: string;
};
