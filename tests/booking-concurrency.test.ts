import { describe, expect, it } from "bun:test";
import type { AppointmentRecord } from "../src/domain/appointment";
import type {
  BusyInterval,
  CalendarEventInput,
  CalendarProvider,
  CreatedCalendarEvent,
} from "../src/providers/calendar/calendar-provider";
import type { AppointmentRepository } from "../src/repository/appointment-repository";
import { InMemoryAppointmentRepository } from "../src/repository/in-memory-appointment-repository";
import { AppointmentService } from "../src/services/appointment-service";

const DATE = "2026-11-10";

function makeRecord(
  startTime: string,
  endTime: string,
  overrides: Partial<AppointmentRecord> = {},
): AppointmentRecord {
  return {
    id: `apt-${startTime}-${endTime}-${Math.random().toString(36).slice(2, 8)}`,
    patientName: "Race Patient",
    patientPhone: "08123456789",
    serviceCode: "A",
    dentistId: "junior",
    date: DATE,
    startTime,
    endTime,
    status: "pending",
    createdAt: "2026-10-26T00:00:00.000Z",
    updatedAt: "2026-10-26T00:00:00.000Z",
    ...overrides,
  };
}

const bookingInput = {
  patientName: "Race Patient",
  patientPhone: "08123456789",
  serviceCode: "A" as const,
  dentistId: "junior",
  date: DATE,
  startTime: "09:00",
};

class ThrowingCalendarProvider implements CalendarProvider {
  async getBusyIntervals(): Promise<BusyInterval[]> {
    return [];
  }

  async createEvent(): Promise<CreatedCalendarEvent> {
    throw new Error("provider exploded: token abc123");
  }
}

class FlakyCalendarProvider implements CalendarProvider {
  private attempts = 0;

  async getBusyIntervals(): Promise<BusyInterval[]> {
    return [];
  }

  async createEvent(input: CalendarEventInput): Promise<CreatedCalendarEvent> {
    this.attempts += 1;
    if (this.attempts === 1) {
      throw new Error("first attempt fails");
    }
    return { id: `cal-evt-${this.attempts}`, start: input.start, end: input.end };
  }
}

describe("Atomic booking reservations", () => {
  it("allows exactly one of two concurrent overlapping repository reservations", async () => {
    const repository = new InMemoryAppointmentRepository();

    const results = await Promise.allSettled([
      repository.reserveIfAvailable(makeRecord("09:00", "10:00")),
      repository.reserveIfAvailable(makeRecord("09:30", "10:30")),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.name).toBe("SlotUnavailableError");

    const rows = await repository.find({ date: DATE });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("pending");
  });

  it("returns the reserved record with pending status", async () => {
    const repository = new InMemoryAppointmentRepository();
    const record = makeRecord("09:00", "10:00");

    const reserved = await repository.reserveIfAvailable(record);

    expect(reserved.id).toBe(record.id);
    expect(reserved.status).toBe("pending");
    expect(reserved.calendarEventId).toBeUndefined();
  });

  it("allows exactly one of two concurrent overlapping service bookings", async () => {
    const repository = new InMemoryAppointmentRepository();
    const service = new AppointmentService(repository);

    const results = await Promise.allSettled([
      service.bookAppointment({ ...bookingInput, patientName: "Patient One" }),
      service.bookAppointment({ ...bookingInput, patientName: "Patient Two" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const rows = await repository.find({ date: DATE, status: ["pending", "confirmed"] });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("confirmed");
  });
});

describe("Calendar synchronization failures", () => {
  it("marks the reservation failed and reports CALENDAR_SYNC_FAILED", async () => {
    const repository = new InMemoryAppointmentRepository();
    const service = new AppointmentService(repository, new ThrowingCalendarProvider());

    await expect(service.bookAppointment(bookingInput)).rejects.toMatchObject({
      code: "CALENDAR_SYNC_FAILED",
    });

    const rows = await repository.find({ date: DATE });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.calendarEventId).toBeUndefined();
  });

  it("never leaks the provider error text to the caller", async () => {
    const repository = new InMemoryAppointmentRepository();
    const service = new AppointmentService(repository, new ThrowingCalendarProvider());

    try {
      await service.bookAppointment(bookingInput);
      throw new Error("expected booking to fail");
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      expect(error.code).toBe("CALENDAR_SYNC_FAILED");
      expect(error.message).toBe("Calendar synchronization failed. Please try again.");
      expect(error.message).not.toContain("abc123");
    }
  });

  it("still reports CALENDAR_SYNC_FAILED when releasing the reservation also fails", async () => {
    const repository = new InMemoryAppointmentRepository();
    const releaseFails: AppointmentRepository = {
      ...repository,
      reserveIfAvailable: repository.reserveIfAvailable.bind(repository),
      find: repository.find.bind(repository),
      findById: repository.findById.bind(repository),
      create: repository.create.bind(repository),
      confirm: repository.confirm.bind(repository),
      updateStatus: async () => {
        throw new Error("database unavailable");
      },
    };
    const service = new AppointmentService(releaseFails, new ThrowingCalendarProvider());

    await expect(service.bookAppointment(bookingInput)).rejects.toMatchObject({
      code: "CALENDAR_SYNC_FAILED",
    });

    // The reservation stays pending, so the slot remains blocked rather than
    // risking a double booking while the release path is broken.
    const rows = await repository.find({ date: DATE });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("pending");
  });

  it("does not treat a failed reservation as busy for a later booking of the same slot", async () => {
    const repository = new InMemoryAppointmentRepository();
    const service = new AppointmentService(repository, new FlakyCalendarProvider());

    await expect(service.bookAppointment(bookingInput)).rejects.toMatchObject({
      code: "CALENDAR_SYNC_FAILED",
    });

    const booked = await service.bookAppointment({ ...bookingInput, patientName: "Retry Patient" });

    expect(booked.status).toBe("confirmed");
    expect(booked.calendarEventId).toBeDefined();

    const active = await repository.find({ date: DATE, status: ["pending", "confirmed"] });
    expect(active).toHaveLength(1);
    expect(active[0]?.patientName).toBe("Retry Patient");
  });
});

describe("Non-overlapping bookings", () => {
  it("allows a later adjacent booking for the same dentist and date", async () => {
    const repository = new InMemoryAppointmentRepository();
    const service = new AppointmentService(repository);

    const first = await service.bookAppointment(bookingInput);
    const later = await service.bookAppointment({
      ...bookingInput,
      patientName: "Later Patient",
      startTime: "10:00",
    });

    expect(first.status).toBe("confirmed");
    expect(later.status).toBe("confirmed");

    const rows = await repository.find({ date: DATE, status: ["pending", "confirmed"] });
    expect(rows).toHaveLength(2);
  });

  it("allows the same time slot for a different dentist", async () => {
    const repository = new InMemoryAppointmentRepository();
    const service = new AppointmentService(repository);

    await service.bookAppointment(bookingInput);
    const otherDentist = await service.bookAppointment({
      ...bookingInput,
      dentistId: "senior-1",
      patientName: "Other Dentist Patient",
    });

    expect(otherDentist.status).toBe("confirmed");
  });
});

describe("Confirmation and status transitions", () => {
  it("confirms a pending reservation with its calendar event ID", async () => {
    const repository = new InMemoryAppointmentRepository();
    const reserved = await repository.reserveIfAvailable(makeRecord("09:00", "10:00"));

    const confirmed = await repository.confirm(reserved.id, "cal-evt-9");

    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.calendarEventId).toBe("cal-evt-9");
    expect(confirmed.updatedAt >= reserved.updatedAt).toBe(true);
  });

  it("throws AppointmentNotFoundError when confirming an unknown reservation", async () => {
    const repository = new InMemoryAppointmentRepository();

    await expect(repository.confirm("missing-id", "cal-evt-1")).rejects.toMatchObject({
      code: "APPOINTMENT_NOT_FOUND",
    });
  });
});
