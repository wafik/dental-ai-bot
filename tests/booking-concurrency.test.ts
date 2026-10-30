import { describe, expect, it } from "bun:test";
import type { AppointmentRecord } from "../src/domain/appointment";
import type {
  BusyInterval,
  CalendarProvider,
  CreatedCalendarEvent,
} from "../src/providers/calendar/calendar-provider";
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

  async deleteEvent(): Promise<void> {
    throw new Error("provider exploded: token abc123");
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
  it("keeps the reservation pending with a durable retry row instead of reporting success", async () => {
    const repository = new InMemoryAppointmentRepository();
    const service = new AppointmentService(repository, { google: new ThrowingCalendarProvider() });

    const booked = await service.bookAppointment(bookingInput);

    expect(booked.status).toBe("pending");

    const syncs = await repository.getCalendarSyncs(booked.id);
    expect(syncs).toHaveLength(1);
    expect(syncs[0]).toMatchObject({ provider: "google", operation: "book", status: "pending" });
    expect(syncs[0]?.attempts).toBe(1);
    // Only a short, credential-free error code is persisted.
    expect(syncs[0]?.lastError).toBe("google:unknown");
  });

  it("never leaks the provider error text into the stored sync state", async () => {
    const repository = new InMemoryAppointmentRepository();
    const service = new AppointmentService(repository, { google: new ThrowingCalendarProvider() });

    const booked = await service.bookAppointment(bookingInput);
    const syncs = await repository.getCalendarSyncs(booked.id);

    expect(JSON.stringify(syncs)).not.toContain("abc123");
  });

  it("keeps the pending reservation's slot blocked for later bookings", async () => {
    const repository = new InMemoryAppointmentRepository();
    const service = new AppointmentService(repository, { google: new ThrowingCalendarProvider() });

    const first = await service.bookAppointment(bookingInput);
    expect(first.status).toBe("pending");

    await expect(
      service.bookAppointment({ ...bookingInput, patientName: "Second Patient" }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

    const active = await repository.find({ date: DATE, status: ["pending", "confirmed"] });
    expect(active).toHaveLength(1);
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
  it("confirms a pending reservation", async () => {
    const repository = new InMemoryAppointmentRepository();
    const reserved = await repository.reserveIfAvailable(makeRecord("09:00", "10:00"));

    const confirmed = await repository.confirm(reserved.id);

    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.updatedAt >= reserved.updatedAt).toBe(true);
  });

  it("throws AppointmentNotFoundError when confirming an unknown reservation", async () => {
    const repository = new InMemoryAppointmentRepository();

    await expect(repository.confirm("missing-id")).rejects.toMatchObject({
      code: "APPOINTMENT_NOT_FOUND",
    });
  });
});
