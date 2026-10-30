import { describe, expect, it, beforeEach } from "bun:test";
import {
  DentistQualificationError,
  SlotUnavailableError,
  AppointmentNotFoundError,
} from "../src/domain/appointment";
import { InMemoryAppointmentRepository } from "../src/repository/in-memory-appointment-repository";
import type {
  CalendarProvider,
  BusyInterval,
  CalendarEventInput,
  CreatedCalendarEvent,
} from "../src/providers/calendar/calendar-provider";
import { AppointmentService } from "../src/services/appointment-service";

class MockCalendarProvider implements CalendarProvider {
  busyIntervals: BusyInterval[] = [];
  createdEvents: CalendarEventInput[] = [];
  deletedEvents: Array<{ dentistId: string; eventId: string }> = [];

  async getBusyIntervals(_input: {
    dentistId: string;
    start: string;
    end: string;
  }): Promise<BusyInterval[]> {
    return this.busyIntervals;
  }

  async createEvent(input: CalendarEventInput): Promise<CreatedCalendarEvent> {
    this.createdEvents.push(input);
    return {
      id: `cal-evt-${this.createdEvents.length}`,
      start: input.start,
      end: input.end,
    };
  }

  async deleteEvent(input: { dentistId: string; eventId: string }): Promise<void> {
    this.deletedEvents.push(input);
  }
}

describe("AppointmentService", () => {
  let repository: InMemoryAppointmentRepository;
  let calendarProvider: MockCalendarProvider;
  let service: AppointmentService;

  beforeEach(() => {
    repository = new InMemoryAppointmentRepository();
    calendarProvider = new MockCalendarProvider();
    service = new AppointmentService(repository, { google: calendarProvider });
  });

  describe("Dentist qualifications", () => {
    it("rejects booking Service C with Junior dentist, throwing DentistQualificationError", async () => {
      await expect(
        service.bookAppointment({
          patientName: "Alice",
          patientPhone: "08123456789",
          serviceCode: "C",
          dentistId: "junior",
          date: "2026-10-25",
          startTime: "09:00",
        }),
      ).rejects.toBeInstanceOf(DentistQualificationError);
    });

    it("rejects booking Service D with Junior dentist, throwing DentistQualificationError", async () => {
      await expect(
        service.bookAppointment({
          patientName: "Alice",
          patientPhone: "08123456789",
          serviceCode: "D",
          dentistId: "junior",
          date: "2026-10-25",
          startTime: "09:00",
        }),
      ).rejects.toBeInstanceOf(DentistQualificationError);
    });

    it("rejects booking Service E with Junior dentist, throwing DentistQualificationError", async () => {
      await expect(
        service.bookAppointment({
          patientName: "Alice",
          patientPhone: "08123456789",
          serviceCode: "E",
          dentistId: "junior",
          date: "2026-10-25",
          startTime: "09:00",
        }),
      ).rejects.toBeInstanceOf(DentistQualificationError);
    });

    it("allows booking Service A and B with Junior dentist", async () => {
      const bookA = await service.bookAppointment({
        patientName: "Alice",
        patientPhone: "08123456789",
        serviceCode: "A",
        dentistId: "junior",
        date: "2026-10-25",
        startTime: "09:00",
      });
      expect(bookA.status).toBe("confirmed");
      expect(bookA.serviceCode).toBe("A");
      expect(bookA.dentistId).toBe("junior");

      const bookB = await service.bookAppointment({
        patientName: "Bob",
        patientPhone: "08123456780",
        serviceCode: "B",
        dentistId: "junior",
        date: "2026-10-25",
        startTime: "10:00",
      });
      expect(bookB.status).toBe("confirmed");
      expect(bookB.serviceCode).toBe("B");
      expect(bookB.dentistId).toBe("junior");
    });

    it("allows booking Services A, B, C, D, and E with Senior 1 and Senior 2", async () => {
      const bookC = await service.bookAppointment({
        patientName: "Charlie",
        patientPhone: "08123456781",
        serviceCode: "C",
        dentistId: "senior-1",
        date: "2026-10-25",
        startTime: "09:00",
      });
      expect(bookC.status).toBe("confirmed");

      const bookD = await service.bookAppointment({
        patientName: "David",
        patientPhone: "08123456782",
        serviceCode: "D",
        dentistId: "senior-2",
        date: "2026-10-25",
        startTime: "09:00",
      });
      expect(bookD.status).toBe("confirmed");

      const bookE = await service.bookAppointment({
        patientName: "Emma",
        patientPhone: "08123456783",
        serviceCode: "E",
        dentistId: "senior-1",
        date: "2026-10-26",
        startTime: "09:00",
      });
      expect(bookE.status).toBe("confirmed");
    });
  });

  describe("Clinic hours and slot boundaries", () => {
    it("rejects booking times before clinic opening (08:30 < 09:00), throwing SlotUnavailableError", async () => {
      await expect(
        service.bookAppointment({
          patientName: "Frank",
          patientPhone: "08123456784",
          serviceCode: "A",
          dentistId: "junior",
          date: "2026-10-25",
          startTime: "08:30",
        }),
      ).rejects.toBeInstanceOf(SlotUnavailableError);
    });

    it("rejects booking durations extending past clinic closing (e.g. Service E 360m starting at 12:00 ends at 18:00 > 17:00), throwing SlotUnavailableError", async () => {
      await expect(
        service.bookAppointment({
          patientName: "Grace",
          patientPhone: "08123456785",
          serviceCode: "E",
          dentistId: "senior-1",
          date: "2026-10-25",
          startTime: "12:00",
        }),
      ).rejects.toBeInstanceOf(SlotUnavailableError);
    });

    it("rejects non-30-minute aligned start times (e.g. 09:15), throwing SlotUnavailableError", async () => {
      await expect(
        service.bookAppointment({
          patientName: "Heidi",
          patientPhone: "08123456786",
          serviceCode: "A",
          dentistId: "junior",
          date: "2026-10-25",
          startTime: "09:15",
        }),
      ).rejects.toBeInstanceOf(SlotUnavailableError);
    });
  });

  describe("Conflict and availability validation", () => {
    it("rejects overlapping bookings when a conflicting appointment exists in repository, throwing SlotUnavailableError", async () => {
      await service.bookAppointment({
        patientName: "Ivan",
        patientPhone: "08123456787",
        serviceCode: "A", // 60 mins -> 09:00 to 10:00
        dentistId: "junior",
        date: "2026-10-25",
        startTime: "09:00",
      });

      // Attempt to book 09:30 to 10:30 with junior
      await expect(
        service.bookAppointment({
          patientName: "Judy",
          patientPhone: "08123456788",
          serviceCode: "A",
          dentistId: "junior",
          date: "2026-10-25",
          startTime: "09:30",
        }),
      ).rejects.toBeInstanceOf(SlotUnavailableError);
    });

    it("rejects overlapping bookings when external calendar returns a busy interval, throwing SlotUnavailableError", async () => {
      // 09:00 to 10:00 in Asia/Jakarta is 02:00 to 03:00 UTC
      calendarProvider.busyIntervals = [
        {
          start: "2026-10-25T02:00:00.000Z",
          end: "2026-10-25T03:00:00.000Z",
        },
      ];

      await expect(
        service.bookAppointment({
          patientName: "Kevin",
          patientPhone: "08123456789",
          serviceCode: "A",
          dentistId: "junior",
          date: "2026-10-25",
          startTime: "09:00",
        }),
      ).rejects.toBeInstanceOf(SlotUnavailableError);
    });
  });

  describe("Booking lifecycle and calendar sync", () => {
    it("successfully books appointment, creates the calendar event, and stores provider sync state", async () => {
      const record = await service.bookAppointment({
        patientName: "Laura",
        patientPhone: "08123456780",
        serviceCode: "A",
        dentistId: "junior",
        date: "2026-10-25",
        startTime: "09:00",
      });

      expect(record.id).toBeDefined();
      expect(record.status).toBe("confirmed");
      expect(record.startTime).toBe("09:00");
      expect(record.endTime).toBe("10:00");

      const syncs = await repository.getCalendarSyncs(record.id);
      expect(syncs).toHaveLength(1);
      expect(syncs[0]).toMatchObject({
        provider: "google",
        operation: "book",
        status: "succeeded",
        eventId: "cal-evt-1",
      });

      expect(calendarProvider.createdEvents).toHaveLength(1);
      expect(calendarProvider.createdEvents[0]?.dentistId).toBe("junior");
      expect(calendarProvider.createdEvents[0]?.start).toBe("2026-10-25T02:00:00.000Z");
      expect(calendarProvider.createdEvents[0]?.end).toBe("2026-10-25T03:00:00.000Z");
      expect(calendarProvider.createdEvents[0]?.idempotencyKey).toBe(record.id.replace(/-/g, ""));
    });

    it("successfully cancels appointment, deletes the external event, and handles duplicate cancellation idempotently", async () => {
      const booked = await service.bookAppointment({
        patientName: "Mallory",
        patientPhone: "08123456781",
        serviceCode: "A",
        dentistId: "junior",
        date: "2026-10-25",
        startTime: "09:00",
      });

      const cancelled1 = await service.cancelAppointment({
        appointmentId: booked.id,
        reason: "Patient request",
      });
      expect(cancelled1.status).toBe("cancelled");
      expect(cancelled1.cancelledAt).toBeDefined();

      expect(calendarProvider.deletedEvents).toEqual([
        { dentistId: "junior", eventId: "cal-evt-1" },
      ]);

      const cancelled2 = await service.cancelAppointment({
        appointmentId: booked.id,
      });
      expect(cancelled2.status).toBe("cancelled");
      expect(cancelled2.cancelledAt).toBe(cancelled1.cancelledAt);
      // A repeated cancellation does not delete the same event twice.
      expect(calendarProvider.deletedEvents).toHaveLength(1);
    });

    it("throws AppointmentNotFoundError when cancelling a non-existent appointment ID", async () => {
      await expect(
        service.cancelAppointment({
          appointmentId: "non-existent-id",
        }),
      ).rejects.toBeInstanceOf(AppointmentNotFoundError);
    });
  });

  describe("getAvailableSlots", () => {
    it("throws DentistQualificationError if dentistId is provided and not qualified for the service", async () => {
      await expect(
        service.getAvailableSlots({
          serviceCode: "C",
          dentistId: "junior",
          date: "2026-10-25",
        }),
      ).rejects.toBeInstanceOf(DentistQualificationError);
    });

    it("returns available slots accounting for both repo appointments and calendar busy intervals", async () => {
      // Junior has busy interval from 09:00 to 10:00 UTC (16:00 to 17:00 local)
      calendarProvider.busyIntervals = [
        {
          start: "2026-10-25T09:00:00.000Z",
          end: "2026-10-25T10:00:00.000Z",
        },
      ];

      // Service A: 60 mins
      const slots = await service.getAvailableSlots({
        serviceCode: "A",
        dentistId: "junior",
        date: "2026-10-25",
      });

      // Should not contain slot starting at 16:00 or ending at 17:00 if it overlaps 16:00-17:00
      const overlappingSlot = slots.find((s) => s.start === "16:00");
      expect(overlappingSlot).toBeUndefined();

      // Should contain 09:00 slot
      const morningSlot = slots.find((s) => s.start === "09:00");
      expect(morningSlot).toBeDefined();
    });
  });
});
