import { describe, expect, it } from "bun:test";
import type {
  BusyInterval,
  CalendarEventInput,
  CalendarProvider,
  CreatedCalendarEvent,
} from "../src/providers/calendar/calendar-provider";
import { InMemoryAppointmentRepository } from "../src/repository/in-memory-appointment-repository";
import { AppointmentService } from "../src/services/appointment-service";
import { createAppointmentsHandlers } from "../src/app/api/v1/appointments/route";

class FailingCalendarProvider implements CalendarProvider {
  async getBusyIntervals(): Promise<BusyInterval[]> {
    return [];
  }

  async createEvent(_input: CalendarEventInput): Promise<CreatedCalendarEvent> {
    throw new Error("upstream calendar unavailable: secret-token");
  }
}

describe("Appointments API Route Handlers", () => {
  const repository = new InMemoryAppointmentRepository();
  const service = new AppointmentService(repository);
  const { GET, POST } = createAppointmentsHandlers({ repository, appointmentService: service });

  describe("GET /api/v1/appointments", () => {
    it("rejects missing or invalid date query parameter with HTTP 400", async () => {
      const req = new Request("http://localhost/api/v1/appointments");
      const res = await GET(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Valid date query parameter (YYYY-MM-DD) is required");
    });

    it("returns confirmed appointments for valid date", async () => {
      // Seed an appointment
      await service.bookAppointment({
        serviceCode: "A",
        dentistId: "junior",
        date: "2026-10-28",
        startTime: "09:00",
        patientName: "John Doe",
        patientPhone: "+62812345678",
      });

      const req = new Request("http://localhost/api/v1/appointments?date=2026-10-28");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.date).toBe("2026-10-28");
      expect(json.appointments.length).toBeGreaterThanOrEqual(1);
      expect(json.appointments[0].patientName).toBe("John Doe");
    });

    it("hides pending and failed reservations from the public listing", async () => {
      const internalRepository = new InMemoryAppointmentRepository();
      await internalRepository.create({
        id: "apt-pending",
        patientName: "Pending Patient",
        patientPhone: "+62811111111",
        serviceCode: "A",
        dentistId: "junior",
        date: "2026-10-30",
        startTime: "09:00",
        endTime: "10:00",
        status: "pending",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
      });
      await internalRepository.create({
        id: "apt-failed",
        patientName: "Failed Patient",
        patientPhone: "+62811111112",
        serviceCode: "A",
        dentistId: "junior",
        date: "2026-10-30",
        startTime: "10:00",
        endTime: "11:00",
        status: "failed",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
      });
      const handlers = createAppointmentsHandlers({ repository: internalRepository });

      const res = await handlers.GET(
        new Request("http://localhost/api/v1/appointments?date=2026-10-30"),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.totalConfirmed).toBe(0);
      expect(json.appointments).toHaveLength(0);
    });
  });

  describe("POST /api/v1/appointments", () => {
    it("rejects invalid request body with HTTP 400", async () => {
      const req = new Request("http://localhost/api/v1/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: "A", // too short
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();
    });

    it("authoritatively rejects unqualified bookings (Junior for Service C) with HTTP 422", async () => {
      const req = new Request("http://localhost/api/v1/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: "Bob Ross",
          patientPhone: "+62812345678",
          serviceCode: "C",
          dentistId: "junior",
          date: "2026-10-28",
          startTime: "14:00",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(422);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Dentist 'junior' is not qualified to perform Service C");
    });

    it("successfully creates a valid appointment with HTTP 201", async () => {
      const req = new Request("http://localhost/api/v1/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: "Charlie Brown",
          patientPhone: "+62812345678",
          serviceCode: "C",
          dentistId: "senior-1",
          date: "2026-10-28",
          startTime: "10:00",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.appointment.patientName).toBe("Charlie Brown");
      expect(json.appointment.status).toBe("confirmed");
    });

    it("returns HTTP 502 with the safe error code when calendar synchronization fails", async () => {
      const failingRepository = new InMemoryAppointmentRepository();
      const failingService = new AppointmentService(
        failingRepository,
        new FailingCalendarProvider(),
      );
      const handlers = createAppointmentsHandlers({
        repository: failingRepository,
        appointmentService: failingService,
      });

      const req = new Request("http://localhost/api/v1/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: "Sync Failure",
          patientPhone: "+62812345678",
          serviceCode: "A",
          dentistId: "senior-2",
          date: "2026-10-29",
          startTime: "09:00",
        }),
      });

      const res = await handlers.POST(req);
      expect(res.status).toBe(502);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe("CALENDAR_SYNC_FAILED");
      expect(json.error).toBe("Calendar synchronization failed. Please try again.");
      expect(JSON.stringify(json)).not.toContain("secret-token");

      // The reservation must no longer block the slot.
      const released = await failingRepository.find({ date: "2026-10-29" });
      expect(released).toHaveLength(1);
      expect(released[0]?.status).toBe("failed");
    });
  });
});
