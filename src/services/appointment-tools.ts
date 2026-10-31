import { SERVICES, type DentalService } from "../domain/clinic";
import type { LLMToolDefinition } from "../providers/ai/llm-provider";
import type { AppointmentService } from "./appointment-service";

/**
 * Tool definitions exposed to the conversational LLM.
 * Adheres strictly to provider-neutral LLMToolDefinition JSON schemas.
 */
export const APPOINTMENT_TOOL_DEFINITIONS: LLMToolDefinition[] = [
  {
    name: "list_services",
    description:
      "List all dental services offered by the clinic with their duration in minutes and eligible dentists.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "check_availability",
    description:
      "Check available appointment time slots for a specific dental service and date, with an optional dentist filter.",
    parameters: {
      type: "object",
      properties: {
        serviceCode: {
          type: "string",
          enum: ["A", "B", "C", "D", "E"],
          description: "Dental service code (A, B, C, D, or E).",
        },
        date: {
          type: "string",
          description: "Appointment date in YYYY-MM-DD format.",
        },
        dentistId: {
          type: "string",
          enum: ["junior", "senior-1", "senior-2"],
          description:
            "Optional dentist ID (junior, senior-1, or senior-2) to filter availability.",
        },
      },
      required: ["serviceCode", "date"],
    },
  },
  {
    name: "book_appointment",
    description: "Book a new dental appointment for a patient after checking availability.",
    parameters: {
      type: "object",
      properties: {
        serviceCode: {
          type: "string",
          enum: ["A", "B", "C", "D", "E"],
          description: "Dental service code (A, B, C, D, or E).",
        },
        dentistId: {
          type: "string",
          enum: ["junior", "senior-1", "senior-2"],
          description: "Dentist ID (junior, senior-1, or senior-2).",
        },
        date: {
          type: "string",
          description: "Appointment date in YYYY-MM-DD format.",
        },
        startTime: {
          type: "string",
          description:
            "Start time in 24-hour HH:mm format, aligned to 30 minutes between 09:00 and 17:00.",
        },
        patientName: {
          type: "string",
          description: "Full name of the patient.",
        },
        patientPhone: {
          type: "string",
          description: "Contact phone number of the patient.",
        },
      },
      required: ["serviceCode", "dentistId", "date", "startTime", "patientName", "patientPhone"],
    },
  },
  {
    name: "cancel_appointment",
    description: "Cancel an existing dental appointment by its appointment ID.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: {
          type: "string",
          description: "Unique ID of the appointment to cancel.",
        },
      },
      required: ["appointmentId"],
    },
  },
];

/** Model-supplied strings are untrusted: bound them before they reach storage or a calendar. */
const MAX_ARG_LENGTH = 200;

function readString(args: Record<string, unknown>, field: string): string | undefined {
  const value = args[field];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_ARG_LENGTH ? trimmed : undefined;
}

/**
 * Dispatches and executes an appointment management tool against the AppointmentService.
 * Returns a JSON-serialized string with the operation output or error.
 */
export async function executeAppointmentTool(
  service: AppointmentService,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    switch (name) {
      case "list_services": {
        const services = SERVICES.map((s) => ({
          code: s.code,
          name: s.name,
          durationMinutes: s.durationMinutes,
          eligibleDentistIds: s.eligibleDentistIds,
        }));
        return JSON.stringify(services);
      }

      case "check_availability": {
        const serviceCode = readString(args, "serviceCode");
        const date = readString(args, "date");
        if (!serviceCode || !date) {
          return JSON.stringify({
            success: false,
            error: "Missing or invalid required fields: serviceCode and date are required.",
          });
        }

        const dentistId = readString(args, "dentistId");

        const slots = await service.getAvailableSlots({
          serviceCode: serviceCode as DentalService["code"],
          date,
          dentistId,
        });

        return JSON.stringify({ success: true, slots });
      }

      case "book_appointment": {
        const requiredFields = [
          "serviceCode",
          "dentistId",
          "date",
          "startTime",
          "patientName",
          "patientPhone",
        ] as const;

        const values = Object.fromEntries(
          requiredFields.map((field) => [field, readString(args, field)]),
        ) as Record<(typeof requiredFields)[number], string | undefined>;

        const missing = requiredFields.filter((field) => !values[field]);

        if (missing.length > 0) {
          return JSON.stringify({
            success: false,
            error: `Missing required fields: ${missing.join(", ")}`,
          });
        }

        const appointment = await service.bookAppointment({
          serviceCode: values.serviceCode as DentalService["code"],
          dentistId: values.dentistId as string,
          date: values.date as string,
          startTime: values.startTime as string,
          patientName: values.patientName as string,
          patientPhone: values.patientPhone as string,
        });

        return JSON.stringify({ success: true, appointment });
      }

      case "cancel_appointment": {
        const appointmentId = readString(args, "appointmentId");
        if (!appointmentId) {
          return JSON.stringify({
            success: false,
            error: "Missing or invalid required field: appointmentId is required.",
          });
        }

        const appointment = await service.cancelAppointment({ appointmentId });

        // A pending external delete means the slot is still held; do not tell the
        // caller it is available again.
        return JSON.stringify({
          success: true,
          appointment,
          message:
            appointment.status === "cancelled"
              ? `Appointment '${appointment.id}' has been successfully cancelled.`
              : `Cancellation for appointment '${appointment.id}' is being finalized; the slot stays reserved until the calendars confirm.`,
        });
      }

      default: {
        return JSON.stringify({
          success: false,
          error: `Unknown tool: ${name}`,
        });
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ success: false, error: message });
  }
}
