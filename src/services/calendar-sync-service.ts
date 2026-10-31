import type { AppointmentRepository } from "../repository/appointment-repository";
import type { AppointmentRecord } from "../domain/appointment";
import type { AppointmentCalendarSync } from "../domain/calendar-sync";
import { SERVICES } from "../domain/clinic";
import {
  CalendarProviderError,
  type BusyInterval,
  type CalendarEventInput,
  type CalendarProvider,
  type CalendarProviderName,
  type CalendarProviderSet,
  type CreatedCalendarEvent,
} from "../providers/calendar/calendar-provider";
import { DEFAULT_CLINIC_TIMEZONE, localToUtcIso } from "../utils/timezone";

/** Retry budget before a pending sync row needs a human. */
export const MAX_SYNC_ATTEMPTS = 8;

const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;

/** Configured providers in a stable order; a missing entry is not configured. */
export function providerEntries(
  providers: CalendarProviderSet,
): Array<[CalendarProviderName, CalendarProvider]> {
  const entries: Array<[CalendarProviderName, CalendarProvider]> = [];
  for (const name of ["google", "outlook"] as const) {
    const provider = providers[name];
    if (provider) {
      entries.push([name, provider]);
    }
  }
  return entries;
}

/** Union of busy intervals from every configured provider. */
export async function collectBusyIntervals(
  providers: CalendarProviderSet,
  input: { dentistId: string; start: string; end: string },
): Promise<BusyInterval[]> {
  const results = await Promise.all(
    providerEntries(providers).map(([, provider]) => provider.getBusyIntervals(input)),
  );
  return results.flat();
}

/** The provider event payload for one appointment, shared by booking and retries. */
export function bookingEventInput(
  record: AppointmentRecord,
  timeZone: string = DEFAULT_CLINIC_TIMEZONE,
): CalendarEventInput {
  const service = SERVICES.find((candidate) => candidate.code === record.serviceCode);
  const serviceName = service?.name ?? record.serviceCode;

  return {
    dentistId: record.dentistId,
    summary: `Dental Appointment: ${serviceName} - ${record.patientName}`,
    description: `Patient: ${record.patientName} (${record.patientPhone})\nService: ${serviceName} (${record.serviceCode})`,
    start: localToUtcIso(record.date, record.startTime, timeZone),
    end: localToUtcIso(record.date, record.endTime, timeZone),
    idempotencyKey: record.id.replace(/-/g, ""),
  };
}

export type SyncOutcome =
  | { ok: true; eventId?: string }
  | { ok: false; retryable: boolean; errorCode: string };

/**
 * A create is only retried automatically when doing so cannot produce a
 * duplicate. Google accepts a caller-supplied event ID, so retrying is safe.
 * Microsoft Graph assigns the ID, so any outcome other than a definitive
 * client-error response is ambiguous and needs manual reconciliation.
 */
export function isRetryableCreateFailure(error: unknown, provider: CalendarProviderName): boolean {
  if (provider === "google") {
    return true;
  }
  return (
    error instanceof CalendarProviderError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500
  );
}

/** Short, credential-free code stored with a failed sync row. */
export function syncErrorCode(error: unknown, provider: CalendarProviderName): string {
  if (error instanceof CalendarProviderError) {
    return `${provider}:${error.operation}:${error.status ?? "network"}`;
  }
  return `${provider}:unknown`;
}

export function nextAttemptAt(attempts: number, nowMs: number = Date.now()): string {
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
  return new Date(nowMs + delay).toISOString();
}

/** Attempts one provider create. Never throws. */
export async function attemptBooking(
  provider: CalendarProvider,
  providerName: CalendarProviderName,
  input: CalendarEventInput,
): Promise<SyncOutcome> {
  try {
    const created: CreatedCalendarEvent = await provider.createEvent(input);
    return { ok: true, eventId: created.id };
  } catch (error: unknown) {
    return {
      ok: false,
      retryable: isRetryableCreateFailure(error, providerName),
      errorCode: syncErrorCode(error, providerName),
    };
  }
}

/**
 * Attempts one provider delete. Deleting is idempotent at both providers, so
 * every failure is retryable.
 */
export async function attemptCancellation(
  provider: CalendarProvider,
  providerName: CalendarProviderName,
  input: { dentistId: string; eventId: string },
): Promise<SyncOutcome> {
  try {
    await provider.deleteEvent(input);
    return { ok: true, eventId: undefined };
  } catch (error: unknown) {
    return { ok: false, retryable: true, errorCode: syncErrorCode(error, providerName) };
  }
}

/**
 * Persists one attempt result. Successful syncs become terminal; retryable
 * failures stay pending with backoff until the retry budget runs out.
 */
export async function recordSyncOutcome(
  repository: AppointmentRepository,
  sync: AppointmentCalendarSync,
  outcome: SyncOutcome,
): Promise<AppointmentCalendarSync> {
  if (outcome.ok) {
    return repository.updateCalendarSync(sync.appointmentId, sync.provider, {
      status: "succeeded",
      eventId: outcome.eventId ?? null,
      lastError: null,
      nextAttemptAt: new Date().toISOString(),
      attempts: sync.attempts,
    });
  }

  const attempts = sync.attempts + 1;
  if (!outcome.retryable || attempts >= MAX_SYNC_ATTEMPTS) {
    return repository.updateCalendarSync(sync.appointmentId, sync.provider, {
      status: "needs_manual_reconciliation",
      lastError: outcome.errorCode.slice(0, 64),
      attempts,
    });
  }

  return repository.updateCalendarSync(sync.appointmentId, sync.provider, {
    status: "pending",
    lastError: outcome.errorCode.slice(0, 64),
    nextAttemptAt: nextAttemptAt(attempts),
    attempts,
  });
}

export type Convergence = "confirmed" | "cancelled" | "unresolved";

/**
 * Moves an appointment to its next lifecycle state once every tracked calendar
 * has converged. Never moves it forward on partial progress.
 */
export async function convergeAppointment(
  repository: AppointmentRepository,
  appointmentId: string,
): Promise<Convergence> {
  const appointment = await repository.findById(appointmentId);
  if (!appointment) {
    return "unresolved";
  }

  const syncs = await repository.getCalendarSyncs(appointmentId);

  // No tracked external work (local-only deployment or a legacy record): the
  // local status is the whole truth, so cancellation completes immediately.
  if (appointment.status === "cancelling" && syncs.length === 0) {
    await repository.updateStatus(appointmentId, "cancelled", new Date().toISOString());
    return "cancelled";
  }

  if (syncs.length === 0) {
    return "unresolved";
  }

  const allSucceeded = syncs.every((sync) => sync.status === "succeeded");

  if (appointment.status === "pending") {
    const booking = syncs.filter((sync) => sync.operation === "book");
    if (booking.length > 0 && booking.every((sync) => sync.status === "succeeded")) {
      await repository.confirm(appointmentId);
      return "confirmed";
    }
  }

  if (appointment.status === "cancelling" && allSucceeded) {
    await repository.updateStatus(appointmentId, "cancelled", new Date().toISOString());
    return "cancelled";
  }

  return "unresolved";
}

export type ReconcileSummary = {
  claimed: number;
  succeeded: number;
  retried: number;
  manual: number;
  confirmed: number;
  cancelled: number;
};

/**
 * Claims due sync rows and retries them. Claims are lease-based, so overlapping
 * scheduler invocations do not process the same row twice. Retries are safe by
 * construction: creates are idempotent on Google, ambiguous Outlook creates are
 * never retried automatically, and deletes are idempotent everywhere.
 */
export async function reconcileDueCalendarSyncs(
  repository: AppointmentRepository,
  providers: CalendarProviderSet,
  options: { limit?: number; leaseMs?: number; now?: Date } = {},
): Promise<ReconcileSummary> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 25;
  const leaseMs = options.leaseMs ?? 5 * 60_000;
  const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();

  const claimed = await repository.claimCalendarSyncs(limit, now.toISOString(), leaseUntil);
  const summary: ReconcileSummary = {
    claimed: claimed.length,
    succeeded: 0,
    retried: 0,
    manual: 0,
    confirmed: 0,
    cancelled: 0,
  };
  const touchedAppointments = new Set<string>();

  for (const sync of claimed) {
    const appointment = await repository.findById(sync.appointmentId);
    const provider = providers[sync.provider];

    if (!appointment || !provider) {
      await repository.updateCalendarSync(sync.appointmentId, sync.provider, {
        status: "needs_manual_reconciliation",
        lastError: appointment ? "provider_not_configured" : "appointment_missing",
      });
      summary.manual += 1;
      continue;
    }

    if (sync.operation === "book" && appointment.status === "cancelled") {
      await repository.updateCalendarSync(sync.appointmentId, sync.provider, {
        status: "needs_manual_reconciliation",
        lastError: "appointment_cancelled",
      });
      summary.manual += 1;
      continue;
    }

    const outcome =
      sync.operation === "book"
        ? await attemptBooking(provider, sync.provider, bookingEventInput(appointment))
        : sync.eventId
          ? await attemptCancellation(provider, sync.provider, {
              dentistId: appointment.dentistId,
              eventId: sync.eventId,
            })
          : { ok: true as const, eventId: undefined };

    const updated = await recordSyncOutcome(repository, sync, outcome);
    if (updated.status === "succeeded") {
      summary.succeeded += 1;
    } else if (updated.status === "pending") {
      summary.retried += 1;
    } else {
      summary.manual += 1;
    }
    touchedAppointments.add(sync.appointmentId);
  }

  for (const appointmentId of touchedAppointments) {
    const convergence = await convergeAppointment(repository, appointmentId);
    if (convergence === "confirmed") {
      summary.confirmed += 1;
    } else if (convergence === "cancelled") {
      summary.cancelled += 1;
    }
  }

  return summary;
}
