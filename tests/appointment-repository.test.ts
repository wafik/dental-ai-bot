import { beforeEach, describe, expect, test } from "bun:test";
import {
  AppointmentError,
  AppointmentNotFoundError,
  DentistQualificationError,
  SlotUnavailableError,
  type AppointmentRecord,
  type BookAppointmentInput,
  type CancelAppointmentInput,
} from "../src/domain/appointment";
import type {
  AppointmentFilter,
  AppointmentRepository,
} from "../src/repository/appointment-repository";
import { DrizzleAppointmentRepository } from "../src/repository/drizzle-appointment-repository";
import { InMemoryAppointmentRepository } from "../src/repository/in-memory-appointment-repository";
import { appointments, appointmentCalendarSyncs } from "../src/repository/schema";

describe("Appointment Domain Models & Error Types", () => {
  test("creates AppointmentError with message and default code", () => {
    const error = new AppointmentError("Generic appointment error");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppointmentError);
    expect(error.name).toBe("AppointmentError");
    expect(error.message).toBe("Generic appointment error");
    expect(error.code).toBe("APPOINTMENT_ERROR");
  });

  test("creates DentistQualificationError with dentistId and serviceCode", () => {
    const error = new DentistQualificationError("junior", "C");
    expect(error).toBeInstanceOf(AppointmentError);
    expect(error.name).toBe("DentistQualificationError");
    expect(error.code).toBe("DENTIST_NOT_QUALIFIED");
    expect(error.message).toContain("junior");
    expect(error.message).toContain("C");
    expect(error.dentistId).toBe("junior");
    expect(error.serviceCode).toBe("C");
  });

  test("creates SlotUnavailableError with message", () => {
    const error = new SlotUnavailableError("Time slot is already occupied");
    expect(error).toBeInstanceOf(AppointmentError);
    expect(error.name).toBe("SlotUnavailableError");
    expect(error.code).toBe("SLOT_UNAVAILABLE");
    expect(error.message).toBe("Time slot is already occupied");
  });

  test("creates AppointmentNotFoundError with appointment ID", () => {
    const error = new AppointmentNotFoundError("apt-missing");
    expect(error).toBeInstanceOf(AppointmentError);
    expect(error.name).toBe("AppointmentNotFoundError");
    expect(error.code).toBe("APPOINTMENT_NOT_FOUND");
    expect(error.message).toContain("apt-missing");
    expect(error.appointmentId).toBe("apt-missing");
  });

  test("verifies BookAppointmentInput and CancelAppointmentInput type shape", () => {
    const bookInput: BookAppointmentInput = {
      patientName: "John Doe",
      patientPhone: "+628111222333",
      serviceCode: "A",
      dentistId: "junior",
      date: "2026-10-26",
      startTime: "10:00",
    };
    expect(bookInput.patientName).toBe("John Doe");

    const cancelInput: CancelAppointmentInput = {
      appointmentId: "apt-123",
      reason: "Patient requested reschedule",
    };
    expect(cancelInput.appointmentId).toBe("apt-123");
  });
});

describe("Drizzle Schema Definition", () => {
  test("defines appointments table with expected column keys", () => {
    expect(appointments).toBeDefined();
    expect(appointments.id).toBeDefined();
    expect(appointments.patientName).toBeDefined();
    expect(appointments.patientPhone).toBeDefined();
    expect(appointments.serviceCode).toBeDefined();
    expect(appointments.dentistId).toBeDefined();
    expect(appointments.date).toBeDefined();
    expect(appointments.startTime).toBeDefined();
    expect(appointments.endTime).toBeDefined();
    expect(appointments.status).toBeDefined();
    expect(appointments.createdAt).toBeDefined();
    expect(appointments.updatedAt).toBeDefined();
    expect(appointments.cancelledAt).toBeDefined();
  });

  test("defines a per-provider calendar sync table", () => {
    expect(appointmentCalendarSyncs).toBeDefined();
    expect(appointmentCalendarSyncs.appointmentId).toBeDefined();
    expect(appointmentCalendarSyncs.provider).toBeDefined();
    expect(appointmentCalendarSyncs.operation).toBeDefined();
    expect(appointmentCalendarSyncs.status).toBeDefined();
    expect(appointmentCalendarSyncs.eventId).toBeDefined();
    expect(appointmentCalendarSyncs.attempts).toBeDefined();
    expect(appointmentCalendarSyncs.nextAttemptAt).toBeDefined();
    expect(appointmentCalendarSyncs.lastError).toBeDefined();
  });
});

describe("InMemoryAppointmentRepository", () => {
  let repository: AppointmentRepository;

  const sampleRecord1: AppointmentRecord = {
    id: "apt-1",
    patientName: "Alice Smith",
    patientPhone: "+628123456789",
    serviceCode: "A",
    dentistId: "junior",
    date: "2026-10-26",
    startTime: "09:00",
    endTime: "10:00",
    status: "confirmed",
    createdAt: "2026-10-20T08:00:00.000Z",
    updatedAt: "2026-10-20T08:00:00.000Z",
  };

  const sampleRecord2: AppointmentRecord = {
    id: "apt-2",
    patientName: "Bob Jones",
    patientPhone: "+628987654321",
    serviceCode: "C",
    dentistId: "senior-1",
    date: "2026-10-26",
    startTime: "10:30",
    endTime: "13:00",
    status: "confirmed",
    createdAt: "2026-10-20T08:15:00.000Z",
    updatedAt: "2026-10-20T08:15:00.000Z",
  };

  const sampleRecord3: AppointmentRecord = {
    id: "apt-3",
    patientName: "Charlie Brown",
    patientPhone: "+628555666777",
    serviceCode: "B",
    dentistId: "junior",
    date: "2026-10-27",
    startTime: "14:00",
    endTime: "15:00",
    status: "cancelled",
    createdAt: "2026-10-20T08:30:00.000Z",
    updatedAt: "2026-10-20T09:00:00.000Z",
    cancelledAt: "2026-10-20T09:00:00.000Z",
  };

  beforeEach(() => {
    repository = new InMemoryAppointmentRepository();
  });

  test("creates and finds an appointment record by ID", async () => {
    const created = await repository.create(sampleRecord1);
    expect(created).toEqual(sampleRecord1);

    const found = await repository.findById("apt-1");
    expect(found).toEqual(sampleRecord1);
  });

  test("returns null when searching for non-existent appointment ID", async () => {
    const found = await repository.findById("non-existent-id");
    expect(found).toBeNull();
  });

  test("filters appointments by dentistId", async () => {
    await repository.create(sampleRecord1);
    await repository.create(sampleRecord2);
    await repository.create(sampleRecord3);

    const juniorAppointments = await repository.find({ dentistId: "junior" });
    expect(juniorAppointments.length).toBe(2);
    expect(juniorAppointments.map((a) => a.id).sort()).toEqual(["apt-1", "apt-3"]);

    const seniorAppointments = await repository.find({ dentistId: "senior-1" });
    expect(seniorAppointments.length).toBe(1);
    expect(seniorAppointments[0]?.id).toBe("apt-2");
  });

  test("filters appointments by date", async () => {
    await repository.create(sampleRecord1);
    await repository.create(sampleRecord2);
    await repository.create(sampleRecord3);

    const oct26Appointments = await repository.find({ date: "2026-10-26" });
    expect(oct26Appointments.length).toBe(2);
    expect(oct26Appointments.map((a) => a.id).sort()).toEqual(["apt-1", "apt-2"]);

    const oct27Appointments = await repository.find({ date: "2026-10-27" });
    expect(oct27Appointments.length).toBe(1);
    expect(oct27Appointments[0]?.id).toBe("apt-3");
  });

  test("filters appointments by status", async () => {
    await repository.create(sampleRecord1);
    await repository.create(sampleRecord2);
    await repository.create(sampleRecord3);

    const confirmed = await repository.find({ status: "confirmed" });
    expect(confirmed.length).toBe(2);
    expect(confirmed.map((a) => a.id).sort()).toEqual(["apt-1", "apt-2"]);

    const cancelled = await repository.find({ status: "cancelled" });
    expect(cancelled.length).toBe(1);
    expect(cancelled[0]?.id).toBe("apt-3");
  });

  test("filters appointments by combined criteria", async () => {
    await repository.create(sampleRecord1);
    await repository.create(sampleRecord2);
    await repository.create(sampleRecord3);

    const filter: AppointmentFilter = {
      dentistId: "junior",
      date: "2026-10-26",
      status: "confirmed",
    };
    const results = await repository.find(filter);
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe("apt-1");

    const emptyResults = await repository.find({
      dentistId: "senior-2",
    });
    expect(emptyResults).toEqual([]);
  });

  test("updates status to cancelled with explicit cancelledAt timestamp", async () => {
    await repository.create(sampleRecord1);

    const cancelledAt = "2026-10-24T12:00:00.000Z";
    const updated = await repository.updateStatus("apt-1", "cancelled", cancelledAt);

    expect(updated.status).toBe("cancelled");
    expect(updated.cancelledAt).toBe(cancelledAt);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(sampleRecord1.updatedAt).getTime(),
    );

    const found = await repository.findById("apt-1");
    expect(found?.status).toBe("cancelled");
    expect(found?.cancelledAt).toBe(cancelledAt);
  });

  test("updates status to cancelled and generates cancelledAt timestamp if omitted", async () => {
    await repository.create(sampleRecord1);

    const beforeUpdate = new Date().toISOString();
    const updated = await repository.updateStatus("apt-1", "cancelled");

    expect(updated.status).toBe("cancelled");
    expect(updated.cancelledAt).toBeDefined();
    expect(new Date(updated.cancelledAt!).getTime()).toBeGreaterThanOrEqual(
      new Date(beforeUpdate).getTime(),
    );
  });

  test("throws AppointmentNotFoundError when updating non-existent appointment", async () => {
    await expect(repository.updateStatus("missing-id", "cancelled")).rejects.toThrow(
      AppointmentNotFoundError,
    );
  });

  test("filters appointments by an array of statuses", async () => {
    await repository.create(sampleRecord1);
    await repository.create(sampleRecord2);
    await repository.create(sampleRecord3);

    const active = await repository.find({ status: ["pending", "confirmed"] });
    expect(active.length).toBe(2);
    expect(active.map((a) => a.id).sort()).toEqual(["apt-1", "apt-2"]);

    const none = await repository.find({ status: ["pending", "failed"] });
    expect(none).toEqual([]);
  });

  test("treats pending records as blocking when creating a confirmed record", async () => {
    await repository.create({
      ...sampleRecord1,
      id: "apt-pending",
      status: "pending",
    });

    await expect(repository.create({ ...sampleRecord1, id: "apt-conflict" })).rejects.toThrow(
      SlotUnavailableError,
    );
  });

  test("reserves a pending record and rejects an overlapping reservation", async () => {
    const reserved = await repository.reserveIfAvailable({
      ...sampleRecord1,
      id: "apt-reserved",
      status: "pending",
    });
    expect(reserved.status).toBe("pending");

    await expect(
      repository.reserveIfAvailable({
        ...sampleRecord1,
        id: "apt-overlap",
        startTime: "09:30",
        endTime: "10:30",
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);

    // A non-overlapping interval on the same day is still allowed.
    const adjacent = await repository.reserveIfAvailable({
      ...sampleRecord1,
      id: "apt-adjacent",
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(adjacent.status).toBe("pending");
  });

  test("failed and cancelled records do not block a new reservation", async () => {
    await repository.create({ ...sampleRecord1, id: "apt-failed", status: "failed" });
    await repository.create({ ...sampleRecord3, id: "apt-cancelled", status: "cancelled" });

    const reserved = await repository.reserveIfAvailable({
      ...sampleRecord1,
      id: "apt-new",
    });
    expect(reserved.status).toBe("pending");
  });

  test("confirms a pending reservation", async () => {
    await repository.create({
      ...sampleRecord1,
      id: "apt-to-confirm",
      status: "pending",
    });

    const confirmed = await repository.confirm("apt-to-confirm");

    expect(confirmed.status).toBe("confirmed");

    const found = await repository.findById("apt-to-confirm");
    expect(found?.status).toBe("confirmed");
  });

  test("throws AppointmentNotFoundError when confirming a non-existent appointment", async () => {
    await expect(repository.confirm("missing-id")).rejects.toBeInstanceOf(AppointmentNotFoundError);
  });

  test("returns cloned records to prevent external mutation", async () => {
    await repository.create(sampleRecord1);

    const fetched = await repository.findById("apt-1");
    expect(fetched).not.toBeNull();
    fetched!.patientName = "Mutated Name";

    const reFetched = await repository.findById("apt-1");
    expect(reFetched?.patientName).toBe("Alice Smith");
  });
});

describe("Per-provider calendar sync state", () => {
  const NOW = "2026-10-26T09:00:00.000Z";

  function syncRow(provider: "google" | "outlook", overrides: Record<string, unknown> = {}) {
    return {
      appointmentId: "apt-sync",
      provider,
      operation: "book" as const,
      status: "pending" as const,
      attempts: 0,
      nextAttemptAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  test("persists independent progress per provider", async () => {
    const repository = new InMemoryAppointmentRepository();
    await repository.saveCalendarSyncs([syncRow("google"), syncRow("outlook")]);

    await repository.updateCalendarSync("apt-sync", "google", {
      status: "succeeded",
      eventId: "g-evt",
    });

    const syncs = await repository.getCalendarSyncs("apt-sync");
    expect(syncs.find((sync) => sync.provider === "google")).toMatchObject({
      status: "succeeded",
      eventId: "g-evt",
    });
    expect(syncs.find((sync) => sync.provider === "outlook")).toMatchObject({
      status: "pending",
    });
  });

  test("claims only due pending rows and leases them", async () => {
    const repository = new InMemoryAppointmentRepository();
    await repository.saveCalendarSyncs([
      syncRow("google"),
      syncRow("outlook", { nextAttemptAt: "2026-10-26T10:00:00.000Z" }),
    ]);

    const leaseUntil = "2026-10-26T09:05:00.000Z";
    const claimed = await repository.claimCalendarSyncs(10, NOW, leaseUntil);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.provider).toBe("google");
    expect(claimed[0]?.nextAttemptAt).toBe(NOW);

    // A second claim while the lease is active gets nothing.
    const second = await repository.claimCalendarSyncs(10, NOW, leaseUntil);
    expect(second).toEqual([]);

    const stored = await repository.getCalendarSyncs("apt-sync");
    expect(stored.find((sync) => sync.provider === "google")?.nextAttemptAt).toBe(leaseUntil);
  });

  test("honors the claim limit and never claims succeeded rows", async () => {
    const repository = new InMemoryAppointmentRepository();
    await repository.saveCalendarSyncs([syncRow("google"), syncRow("outlook")]);
    await repository.updateCalendarSync("apt-sync", "outlook", { status: "succeeded" });

    const claimed = await repository.claimCalendarSyncs(1, NOW, "2026-10-26T09:05:00.000Z");
    expect(claimed).toHaveLength(1);
  });

  test("throws when updating a sync row that does not exist", async () => {
    const repository = new InMemoryAppointmentRepository();

    await expect(
      repository.updateCalendarSync("missing", "google", { status: "succeeded" }),
    ).rejects.toBeInstanceOf(AppointmentNotFoundError);
  });
});

describe("DrizzleAppointmentRepository", () => {
  const sampleRecordForReservation: AppointmentRecord = {
    id: "apt-reserve",
    patientName: "Reservation Patient",
    patientPhone: "+628123456789",
    serviceCode: "A",
    dentistId: "junior",
    date: "2026-10-26",
    startTime: "09:00",
    endTime: "10:00",
    status: "pending",
    createdAt: "2026-10-20T08:00:00.000Z",
    updatedAt: "2026-10-20T08:00:00.000Z",
  };

  test("instantiates successfully with mock or injected Drizzle db instance", () => {
    const mockDb = {
      insert: () => ({ values: () => Promise.resolve() }),
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
    };

    const drizzleRepo = new DrizzleAppointmentRepository(mockDb as unknown as never);
    expect(drizzleRepo).toBeDefined();
    expect(typeof drizzleRepo.create).toBe("function");
    expect(typeof drizzleRepo.reserveIfAvailable).toBe("function");
    expect(typeof drizzleRepo.confirm).toBe("function");
    expect(typeof drizzleRepo.findById).toBe("function");
    expect(typeof drizzleRepo.find).toBe("function");
    expect(typeof drizzleRepo.updateStatus).toBe("function");
  });

  test("runs the reservation inside a transaction guarded by an advisory lock", async () => {
    const executed: string[] = [];
    let insertedStatus: string | undefined;
    let transactionCount = 0;

    const tx = {
      execute: async () => {
        executed.push("lock");
      },
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
      insert: () => ({
        values: async (row: { status: string }) => {
          insertedStatus = row.status;
        },
      }),
    };

    const mockDb = {
      transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        transactionCount += 1;
        return callback(tx);
      },
    };

    const drizzleRepo = new DrizzleAppointmentRepository(mockDb as unknown as never);
    const reserved = await drizzleRepo.reserveIfAvailable(sampleRecordForReservation);

    expect(transactionCount).toBe(1);
    expect(executed).toEqual(["lock"]);
    expect(insertedStatus).toBe("pending");
    expect(reserved.status).toBe("pending");
    expect(reserved.id).toBe(sampleRecordForReservation.id);
  });

  test("aborts the reservation transaction when an active interval overlaps", async () => {
    let insertCalled = false;

    const tx = {
      execute: async () => undefined,
      select: () => ({
        from: () => ({
          where: async () => [
            { startTime: "09:30", endTime: "10:30" },
            { startTime: "12:00", endTime: "13:00" },
          ],
        }),
      }),
      insert: () => ({
        values: async () => {
          insertCalled = true;
        },
      }),
    };

    const mockDb = {
      transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
    };

    const drizzleRepo = new DrizzleAppointmentRepository(mockDb as unknown as never);

    await expect(drizzleRepo.reserveIfAvailable(sampleRecordForReservation)).rejects.toBeInstanceOf(
      SlotUnavailableError,
    );
    expect(insertCalled).toBe(false);
  });
});
