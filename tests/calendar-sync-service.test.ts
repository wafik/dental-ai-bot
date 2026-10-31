import { beforeEach, describe, expect, it } from "bun:test";
import { SlotUnavailableError, type BookAppointmentInput } from "../src/domain/appointment";
import { CalendarProviderError } from "../src/providers/calendar/calendar-error";
import type {
  BusyInterval,
  CalendarEventInput,
  CalendarProvider,
  CalendarProviderName,
  CreatedCalendarEvent,
} from "../src/providers/calendar/calendar-provider";
import { InMemoryAppointmentRepository } from "../src/repository/in-memory-appointment-repository";
import { AppointmentService } from "../src/services/appointment-service";
import {
  MAX_SYNC_ATTEMPTS,
  reconcileDueCalendarSyncs,
} from "../src/services/calendar-sync-service";

const DATE = "2026-11-12";
/** Later than the first retry backoff (2 minutes) after a failed attempt. */
const RETRY_TIME = () => new Date(Date.now() + 5 * 60_000);

const bookingInput: BookAppointmentInput = {
  patientName: "Dual Sync Patient",
  patientPhone: "08123456789",
  serviceCode: "A",
  dentistId: "junior",
  date: DATE,
  startTime: "09:00",
};

/** Configurable fake that records calls and can fail on demand. */
class FakeProvider implements CalendarProvider {
  busyIntervals: BusyInterval[] = [];
  created: CalendarEventInput[] = [];
  deleted: Array<{ dentistId: string; eventId: string }> = [];
  createFailures = 0;
  deleteFailures = 0;
  createError: () => unknown = () => new Error("network down");
  deleteError: () => unknown = () => new Error("network down");

  constructor(readonly name: CalendarProviderName) {}

  async getBusyIntervals(): Promise<BusyInterval[]> {
    return this.busyIntervals;
  }

  async createEvent(input: CalendarEventInput): Promise<CreatedCalendarEvent> {
    if (this.createFailures > 0) {
      this.createFailures -= 1;
      throw this.createError();
    }
    this.created.push(input);
    return { id: `${this.name}-evt-${this.created.length}`, start: input.start, end: input.end };
  }

  async deleteEvent(input: { dentistId: string; eventId: string }): Promise<void> {
    if (this.deleteFailures > 0) {
      this.deleteFailures -= 1;
      throw this.deleteError();
    }
    this.deleted.push(input);
  }
}

/** A definitive provider rejection: retryable for both providers. */
function rateLimited(): () => unknown {
  return () =>
    new CalendarProviderError({
      message: "provider rejected the request",
      provider: "outlook",
      operation: "createEvent",
      status: 429,
    });
}

describe("Dual-provider booking", () => {
  let repository: InMemoryAppointmentRepository;
  let google: FakeProvider;
  let outlook: FakeProvider;

  beforeEach(() => {
    repository = new InMemoryAppointmentRepository();
    google = new FakeProvider("google");
    outlook = new FakeProvider("outlook");
  });

  function service(): AppointmentService {
    return new AppointmentService(repository, { google, outlook });
  }

  it("writes to both calendars and confirms only after both succeed", async () => {
    const booked = await service().bookAppointment(bookingInput);

    expect(booked.status).toBe("confirmed");
    expect(google.created).toHaveLength(1);
    expect(outlook.created).toHaveLength(1);

    const syncs = await repository.getCalendarSyncs(booked.id);
    expect(syncs).toHaveLength(2);
    expect(syncs.every((sync) => sync.status === "succeeded")).toBe(true);
  });

  it("unions busy intervals from both providers when computing availability", async () => {
    // 09:00-10:00 local is 02:00-03:00 UTC in Asia/Jakarta.
    outlook.busyIntervals = [
      { start: "2026-11-12T02:00:00.000Z", end: "2026-11-12T03:00:00.000Z" },
    ];

    const slots = await service().getAvailableSlots({ serviceCode: "A", date: DATE });

    expect(slots.some((slot) => slot.start === "09:00")).toBe(false);
  });

  it("keeps the appointment pending when one provider fails, and retries later", async () => {
    outlook.createFailures = 1;
    outlook.createError = rateLimited();

    const booked = await service().bookAppointment(bookingInput);
    expect(booked.status).toBe("pending");

    const syncs = await repository.getCalendarSyncs(booked.id);
    expect(syncs.find((sync) => sync.provider === "google")?.status).toBe("succeeded");
    expect(syncs.find((sync) => sync.provider === "outlook")?.status).toBe("pending");

    // Reconciling once the provider recovers confirms the appointment.
    const summary = await reconcileDueCalendarSyncs(
      repository,
      { google, outlook },
      { now: RETRY_TIME() },
    );

    expect(summary.claimed).toBe(1);
    expect(summary.confirmed).toBe(1);

    const confirmed = await repository.findById(booked.id);
    expect(confirmed?.status).toBe("confirmed");
    expect(outlook.created).toHaveLength(1);
  });

  it("does not retry an ambiguous Outlook create automatically", async () => {
    outlook.createFailures = 1;
    outlook.createError = () => new Error("socket hang up");

    const booked = await service().bookAppointment(bookingInput);
    expect(booked.status).toBe("pending");

    const outlookSync = (await repository.getCalendarSyncs(booked.id)).find(
      (sync) => sync.provider === "outlook",
    );
    expect(outlookSync?.status).toBe("needs_manual_reconciliation");
  });

  it("still retries an ambiguous Google create because its event id is caller-supplied", async () => {
    google.createFailures = 1;
    google.createError = () => new Error("socket hang up");

    const booked = await service().bookAppointment(bookingInput);
    expect(booked.status).toBe("pending");

    const googleSync = (await repository.getCalendarSyncs(booked.id)).find(
      (sync) => sync.provider === "google",
    );
    expect(googleSync?.status).toBe("pending");
  });

  it("gives up after the retry budget and flags the row for manual reconciliation", async () => {
    outlook.createFailures = 10;
    outlook.createError = rateLimited();

    const booked = await service().bookAppointment(bookingInput);
    const row = (await repository.getCalendarSyncs(booked.id)).find(
      (sync) => sync.provider === "outlook",
    );
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(1);

    // Repeated reconciliation claims exhaust the budget eventually.
    let now = Date.now();
    for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt += 1) {
      now += 2 * 60 * 60_000;
      await reconcileDueCalendarSyncs(repository, { google, outlook }, { now: new Date(now) });
    }

    const finalRow = (await repository.getCalendarSyncs(booked.id)).find(
      (sync) => sync.provider === "outlook",
    );
    expect(finalRow?.status).toBe("needs_manual_reconciliation");
    expect(finalRow?.attempts).toBe(MAX_SYNC_ATTEMPTS);
    expect(finalRow?.lastError).not.toContain("network down");
  });

  it("concurrent reconciliation workers never process the same row twice", async () => {
    outlook.createFailures = 1;
    outlook.createError = rateLimited();
    const booked = await service().bookAppointment(bookingInput);

    const now = RETRY_TIME();
    const [first, second] = await Promise.all([
      reconcileDueCalendarSyncs(repository, { google, outlook }, { now }),
      reconcileDueCalendarSyncs(repository, { google, outlook }, { now }),
    ]);

    expect(first.claimed + second.claimed).toBe(1);
    expect(outlook.created).toHaveLength(1);
    expect((await repository.findById(booked.id))?.status).toBe("confirmed");
  });

  it("marks a due book row as manual when the appointment was cancelled meanwhile", async () => {
    outlook.createFailures = 1;
    outlook.createError = rateLimited();
    const booked = await service().bookAppointment(bookingInput);
    await repository.updateStatus(booked.id, "cancelled", new Date().toISOString());

    const summary = await reconcileDueCalendarSyncs(
      repository,
      { google, outlook },
      { now: RETRY_TIME() },
    );

    expect(summary.manual).toBe(1);
    const row = (await repository.getCalendarSyncs(booked.id)).find(
      (sync) => sync.provider === "outlook",
    );
    expect(row?.lastError).toBe("appointment_cancelled");
  });

  it("marks rows as manual when the provider is no longer configured", async () => {
    outlook.createFailures = 1;
    outlook.createError = rateLimited();
    const booked = await service().bookAppointment(bookingInput);

    const summary = await reconcileDueCalendarSyncs(repository, { google }, { now: RETRY_TIME() });

    expect(summary.manual).toBe(1);
    const row = (await repository.getCalendarSyncs(booked.id)).find(
      (sync) => sync.provider === "outlook",
    );
    expect(row?.lastError).toBe("provider_not_configured");
  });
});

describe("Dual-provider cancellation", () => {
  let repository: InMemoryAppointmentRepository;
  let google: FakeProvider;
  let outlook: FakeProvider;

  beforeEach(() => {
    repository = new InMemoryAppointmentRepository();
    google = new FakeProvider("google");
    outlook = new FakeProvider("outlook");
  });

  function service(): AppointmentService {
    return new AppointmentService(repository, { google, outlook });
  }

  it("deletes the event from both calendars and then marks the appointment cancelled", async () => {
    const booked = await service().bookAppointment(bookingInput);
    const cancelled = await service().cancelAppointment({ appointmentId: booked.id });

    expect(cancelled.status).toBe("cancelled");
    expect(google.deleted).toEqual([{ dentistId: "junior", eventId: "google-evt-1" }]);
    expect(outlook.deleted).toEqual([{ dentistId: "junior", eventId: "outlook-evt-1" }]);
  });

  it("keeps the appointment cancelling and the slot blocked while a delete is retried", async () => {
    const booked = await service().bookAppointment(bookingInput);
    outlook.deleteFailures = 1;
    outlook.deleteError = rateLimited();

    const pending = await service().cancelAppointment({ appointmentId: booked.id });
    expect(pending.status).toBe("cancelling");

    // The slot stays blocked while the external event may still exist.
    await expect(
      service().bookAppointment({ ...bookingInput, patientName: "Next Patient" }),
    ).rejects.toThrow(SlotUnavailableError);
  });

  it("completes a previously failed cancellation on a repeated request", async () => {
    const booked = await service().bookAppointment(bookingInput);
    outlook.deleteFailures = 1;
    outlook.deleteError = rateLimited();

    expect((await service().cancelAppointment({ appointmentId: booked.id })).status).toBe(
      "cancelling",
    );

    const retried = await service().cancelAppointment({ appointmentId: booked.id });

    expect(retried.status).toBe("cancelled");
    // Google's row was already terminal, so it is not deleted twice.
    expect(google.deleted).toHaveLength(1);
    expect(outlook.deleted).toHaveLength(1);
  });

  it("holds a failed delete in the reconciler until it succeeds", async () => {
    const booked = await service().bookAppointment(bookingInput);
    outlook.deleteFailures = 1;
    outlook.deleteError = () => new Error("socket hang up");
    await service().cancelAppointment({ appointmentId: booked.id });

    expect((await repository.findById(booked.id))?.status).toBe("cancelling");

    const summary = await reconcileDueCalendarSyncs(
      repository,
      { google, outlook },
      { now: RETRY_TIME() },
    );

    expect(summary.cancelled).toBe(1);
    expect((await repository.findById(booked.id))?.status).toBe("cancelled");
  });

  it("cancels locally and immediately when no calendar is configured", async () => {
    const localRepository = new InMemoryAppointmentRepository();
    const localService = new AppointmentService(localRepository);

    const booked = await localService.bookAppointment(bookingInput);
    expect(booked.status).toBe("confirmed");
    expect(await localRepository.getCalendarSyncs(booked.id)).toEqual([]);

    const cancelled = await localService.cancelAppointment({ appointmentId: booked.id });
    expect(cancelled.status).toBe("cancelled");
  });

  it("deletes the deterministic Google id when the create never reported success", async () => {
    google.createFailures = 1;
    google.createError = rateLimited();
    outlook.createFailures = 1;
    outlook.createError = rateLimited();

    const booked = await service().bookAppointment(bookingInput);
    expect(booked.status).toBe("pending");

    const cancelled = await service().cancelAppointment({ appointmentId: booked.id });
    expect(cancelled.status).toBe("cancelled");

    // Google's event id is derived from the appointment, so the delete is safe
    // even though creation never succeeded. Outlook has no such id.
    expect(google.deleted).toEqual([{ dentistId: "junior", eventId: booked.id.replace(/-/g, "") }]);
    expect(outlook.deleted).toEqual([]);
  });

  it("keeps an unresolved booking flagged when it is cancelled", async () => {
    // Outlook cannot say whether the event exists, so it cannot be retried.
    outlook.createFailures = 1;
    outlook.createError = () => new Error("socket hang up");

    const booked = await service().bookAppointment(bookingInput);
    const cancelled = await service().cancelAppointment({ appointmentId: booked.id });

    // Google could be cleaned up deterministically; the Outlook event may
    // still exist remotely, so the appointment stays unresolved.
    expect(cancelled.status).toBe("cancelling");
  });
});

describe("Reconciliation status reporting", () => {
  it("returns zero counts when nothing is due", async () => {
    const repository = new InMemoryAppointmentRepository();
    const summary = await reconcileDueCalendarSyncs(repository, {});

    expect(summary).toEqual({
      claimed: 0,
      succeeded: 0,
      retried: 0,
      manual: 0,
      confirmed: 0,
      cancelled: 0,
    });
  });

  it("respects the batch limit", async () => {
    const repository = new InMemoryAppointmentRepository();
    const google = new FakeProvider("google");
    google.createFailures = 3;
    google.createError = rateLimited();

    const service = new AppointmentService(repository, { google });
    for (const startTime of ["09:00", "10:00", "11:00"]) {
      await service.bookAppointment({ ...bookingInput, startTime });
    }

    const summary = await reconcileDueCalendarSyncs(
      repository,
      { google },
      { limit: 2, now: RETRY_TIME() },
    );
    expect(summary.claimed).toBe(2);
  });
});
