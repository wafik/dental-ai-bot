import { describe, expect, it, beforeEach } from "bun:test";
import { InMemoryAppointmentRepository } from "../src/repository/in-memory-appointment-repository";
import type {
  CalendarProvider,
  BusyInterval,
  CalendarEventInput,
  CreatedCalendarEvent,
} from "../src/providers/calendar/calendar-provider";
import { AppointmentService } from "../src/services/appointment-service";
import {
  APPOINTMENT_TOOL_DEFINITIONS,
  executeAppointmentTool,
} from "../src/services/appointment-tools";

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

describe("APPOINTMENT_TOOL_DEFINITIONS", () => {
  it("defines exactly the 4 required tools with valid schema structures", () => {
    expect(APPOINTMENT_TOOL_DEFINITIONS).toHaveLength(4);
    const toolNames = APPOINTMENT_TOOL_DEFINITIONS.map((tool) => tool.name);
    expect(toolNames).toContain("list_services");
    expect(toolNames).toContain("check_availability");
    expect(toolNames).toContain("book_appointment");
    expect(toolNames).toContain("cancel_appointment");

    for (const tool of APPOINTMENT_TOOL_DEFINITIONS) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.parameters.type).toBe("object");
      expect(typeof tool.parameters.properties).toBe("object");
    }
  });

  it("validates list_services schema definition", () => {
    const tool = APPOINTMENT_TOOL_DEFINITIONS.find((t) => t.name === "list_services");
    expect(tool).toBeDefined();
    expect(tool?.description).toContain("dental services");
    expect(Object.keys(tool!.parameters.properties)).toHaveLength(0);
  });

  it("validates check_availability schema definition", () => {
    const tool = APPOINTMENT_TOOL_DEFINITIONS.find((t) => t.name === "check_availability");
    expect(tool).toBeDefined();
    expect(tool?.parameters.required).toEqual(["serviceCode", "date"]);

    const props = tool!.parameters.properties as Record<string, Record<string, unknown>>;
    expect(props.serviceCode).toBeDefined();
    expect(props.serviceCode?.type).toBe("string");
    expect(props.serviceCode?.enum).toEqual(["A", "B", "C", "D", "E"]);

    expect(props.date).toBeDefined();
    expect(props.date?.type).toBe("string");

    expect(props.dentistId).toBeDefined();
    expect(props.dentistId?.type).toBe("string");
    expect(props.dentistId?.enum).toEqual(["junior", "senior-1", "senior-2"]);
  });

  it("validates book_appointment schema definition", () => {
    const tool = APPOINTMENT_TOOL_DEFINITIONS.find((t) => t.name === "book_appointment");
    expect(tool).toBeDefined();
    expect(tool?.parameters.required).toEqual([
      "serviceCode",
      "dentistId",
      "date",
      "startTime",
      "patientName",
      "patientPhone",
    ]);

    const props = tool!.parameters.properties as Record<string, Record<string, unknown>>;
    expect(props.serviceCode?.type).toBe("string");
    expect(props.dentistId?.type).toBe("string");
    expect(props.date?.type).toBe("string");
    expect(props.startTime?.type).toBe("string");
    expect(props.patientName?.type).toBe("string");
    expect(props.patientPhone?.type).toBe("string");
  });

  it("validates cancel_appointment schema definition", () => {
    const tool = APPOINTMENT_TOOL_DEFINITIONS.find((t) => t.name === "cancel_appointment");
    expect(tool).toBeDefined();
    expect(tool?.parameters.required).toEqual(["appointmentId"]);

    const props = tool!.parameters.properties as Record<string, Record<string, unknown>>;
    expect(props.appointmentId).toBeDefined();
    expect(props.appointmentId?.type).toBe("string");
  });
});

describe("executeAppointmentTool", () => {
  let repository: InMemoryAppointmentRepository;
  let calendarProvider: MockCalendarProvider;
  let service: AppointmentService;

  beforeEach(() => {
    repository = new InMemoryAppointmentRepository();
    calendarProvider = new MockCalendarProvider();
    service = new AppointmentService(repository, { google: calendarProvider });
  });

  describe("list_services execution", () => {
    it("returns JSON array of 5 services with codes, names, durations, and eligible dentists", async () => {
      const rawResult = await executeAppointmentTool(service, "list_services", {});
      const services = JSON.parse(rawResult);

      expect(Array.isArray(services)).toBe(true);
      expect(services).toHaveLength(5);

      const codes = services.map((s: { code: string }) => s.code);
      expect(codes).toEqual(["A", "B", "C", "D", "E"]);

      for (const svc of services) {
        expect(typeof svc.code).toBe("string");
        expect(typeof svc.name).toBe("string");
        expect(typeof svc.durationMinutes).toBe("number");
        expect(Array.isArray(svc.eligibleDentistIds)).toBe(true);
        expect(svc.eligibleDentistIds.length).toBeGreaterThan(0);
      }
    });
  });

  describe("check_availability execution", () => {
    it("returns open slots for valid qualified service and date", async () => {
      const rawResult = await executeAppointmentTool(service, "check_availability", {
        serviceCode: "A",
        date: "2026-10-25",
        dentistId: "junior",
      });

      const parsed = JSON.parse(rawResult);
      expect(parsed.success).toBe(true);
      expect(Array.isArray(parsed.slots)).toBe(true);
      expect(parsed.slots.length).toBeGreaterThan(0);
      expect(parsed.slots[0].date).toBe("2026-10-25");
      expect(parsed.slots[0].dentistId).toBe("junior");
      expect(parsed.slots[0].start).toBeDefined();
      expect(parsed.slots[0].end).toBeDefined();
    });

    it("returns qualification error message when Junior is requested for Service C", async () => {
      const rawResult = await executeAppointmentTool(service, "check_availability", {
        serviceCode: "C",
        date: "2026-10-25",
        dentistId: "junior",
      });

      const parsed = JSON.parse(rawResult);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("junior");
      expect(parsed.error).toContain("Service C");
    });

    it("returns structured error for missing required fields", async () => {
      const rawResultMissingCode = await executeAppointmentTool(service, "check_availability", {
        date: "2026-10-25",
      });
      const parsedMissingCode = JSON.parse(rawResultMissingCode);
      expect(parsedMissingCode.success).toBe(false);
      expect(parsedMissingCode.error).toBeDefined();

      const rawResultMissingDate = await executeAppointmentTool(service, "check_availability", {
        serviceCode: "A",
      });
      const parsedMissingDate = JSON.parse(rawResultMissingDate);
      expect(parsedMissingDate.success).toBe(false);
      expect(parsedMissingDate.error).toBeDefined();
    });

    it("returns structured error for non-existent service code", async () => {
      const rawResult = await executeAppointmentTool(service, "check_availability", {
        serviceCode: "Z",
        date: "2026-10-25",
      });
      const parsed = JSON.parse(rawResult);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Z");
    });
  });

  describe("book_appointment execution", () => {
    it("successfully books an appointment and returns appointment record details", async () => {
      const rawResult = await executeAppointmentTool(service, "book_appointment", {
        serviceCode: "A",
        dentistId: "junior",
        date: "2026-10-25",
        startTime: "09:00",
        patientName: "John Doe",
        patientPhone: "08123456789",
      });

      const parsed = JSON.parse(rawResult);
      expect(parsed.success).toBe(true);
      expect(parsed.appointment).toBeDefined();
      expect(parsed.appointment.id).toBeDefined();
      expect(parsed.appointment.patientName).toBe("John Doe");
      expect(parsed.appointment.serviceCode).toBe("A");
      expect(parsed.appointment.dentistId).toBe("junior");
      expect(parsed.appointment.startTime).toBe("09:00");
      expect(parsed.appointment.endTime).toBe("10:00");
      expect(parsed.appointment.status).toBe("confirmed");
    });

    it("rejects booking when Junior is requested for Service C", async () => {
      const rawResult = await executeAppointmentTool(service, "book_appointment", {
        serviceCode: "C",
        dentistId: "junior",
        date: "2026-10-25",
        startTime: "09:00",
        patientName: "John Doe",
        patientPhone: "08123456789",
      });

      const parsed = JSON.parse(rawResult);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("junior");
      expect(parsed.error).toContain("Service C");
    });

    it("rejects booking when Junior is requested for Service D", async () => {
      const rawResult = await executeAppointmentTool(service, "book_appointment", {
        serviceCode: "D",
        dentistId: "junior",
        date: "2026-10-25",
        startTime: "09:00",
        patientName: "John Doe",
        patientPhone: "08123456789",
      });

      const parsed = JSON.parse(rawResult);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("junior");
    });

    it("rejects booking when Junior is requested for Service E", async () => {
      const rawResult = await executeAppointmentTool(service, "book_appointment", {
        serviceCode: "E",
        dentistId: "junior",
        date: "2026-10-25",
        startTime: "09:00",
        patientName: "John Doe",
        patientPhone: "08123456789",
      });

      const parsed = JSON.parse(rawResult);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("junior");
    });

    it("rejects booking when slot is outside working hours", async () => {
      const rawResult = await executeAppointmentTool(service, "book_appointment", {
        serviceCode: "A",
        dentistId: "senior-1",
        date: "2026-10-25",
        startTime: "08:00",
        patientName: "Early Bird",
        patientPhone: "08123456789",
      });

      const parsed = JSON.parse(rawResult);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("working hours");
    });

    it("rejects booking when slot is already booked (unavailable)", async () => {
      // First booking succeeds
      await executeAppointmentTool(service, "book_appointment", {
        serviceCode: "A",
        dentistId: "senior-1",
        date: "2026-10-25",
        startTime: "10:00",
        patientName: "First Patient",
        patientPhone: "08123456789",
      });

      // Second booking on the exact same slot must be rejected
      const rawResultConflict = await executeAppointmentTool(service, "book_appointment", {
        serviceCode: "A",
        dentistId: "senior-1",
        date: "2026-10-25",
        startTime: "10:00",
        patientName: "Second Patient",
        patientPhone: "08987654321",
      });

      const parsedConflict = JSON.parse(rawResultConflict);
      expect(parsedConflict.success).toBe(false);
      expect(parsedConflict.error).toBeDefined();
    });

    it("returns structured error when required fields are missing", async () => {
      const rawResult = await executeAppointmentTool(service, "book_appointment", {
        serviceCode: "A",
        dentistId: "junior",
        date: "2026-10-25",
        // startTime missing
        patientName: "John Doe",
        patientPhone: "08123456789",
      });

      const parsed = JSON.parse(rawResult);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Missing required fields");
    });
  });

  describe("cancel_appointment execution", () => {
    it("successfully cancels an existing appointment and returns confirmation", async () => {
      // Book an appointment first
      const rawBook = await executeAppointmentTool(service, "book_appointment", {
        serviceCode: "A",
        dentistId: "junior",
        date: "2026-10-25",
        startTime: "09:00",
        patientName: "Jane Doe",
        patientPhone: "08123456789",
      });
      const booked = JSON.parse(rawBook);
      const appointmentId = booked.appointment.id;

      // Cancel the appointment
      const rawCancel = await executeAppointmentTool(service, "cancel_appointment", {
        appointmentId,
      });
      const cancelled = JSON.parse(rawCancel);

      expect(cancelled.success).toBe(true);
      expect(cancelled.appointment).toBeDefined();
      expect(cancelled.appointment.id).toBe(appointmentId);
      expect(cancelled.appointment.status).toBe("cancelled");
    });

    it("returns structured error for non-existent appointment ID", async () => {
      const rawCancel = await executeAppointmentTool(service, "cancel_appointment", {
        appointmentId: "non-existent-uuid-123",
      });
      const parsed = JSON.parse(rawCancel);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("non-existent-uuid-123");
    });

    it("returns structured error when appointmentId is missing", async () => {
      const rawCancel = await executeAppointmentTool(service, "cancel_appointment", {});
      const parsed = JSON.parse(rawCancel);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("appointmentId");
    });
  });

  describe("unknown tool name execution", () => {
    it("returns structured error for unknown tool name", async () => {
      const rawResult = await executeAppointmentTool(service, "some_unknown_tool", {});
      const parsed = JSON.parse(rawResult);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Unknown tool: some_unknown_tool");
    });

    it("rejects oversized model-supplied fields before they reach a calendar event", async () => {
      const rawResult = await executeAppointmentTool(service, "book_appointment", {
        serviceCode: "A",
        dentistId: "junior",
        date: "2026-10-25",
        startTime: "09:00",
        patientName: "x".repeat(5000),
        patientPhone: "08123456789",
      });
      const parsed = JSON.parse(rawResult);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("patientName");
    });

    it("treats a blank or wrong-typed field as missing", async () => {
      const rawResult = await executeAppointmentTool(service, "cancel_appointment", {
        appointmentId: "   ",
      });
      expect(JSON.parse(rawResult).error).toContain("appointmentId");
    });
  });
});
