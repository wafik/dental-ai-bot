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
        if (
          !args.serviceCode ||
          typeof args.serviceCode !== "string" ||
          !args.date ||
          typeof args.date !== "string"
        ) {
          return JSON.stringify({
            success: false,
            error: "Missing or invalid required fields: serviceCode and date are required.",
          });
        }

        const serviceCode = args.serviceCode as DentalService["code"];
        const date = args.date;
        const dentistId = typeof args.dentistId === "string" ? args.dentistId : undefined;

        const slots = await service.getAvailableSlots({
          serviceCode,
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

        const missing = requiredFields.filter(
          (field) => !args[field] || typeof args[field] !== "string",
        );

        if (missing.length > 0) {
          return JSON.stringify({
            success: false,
            error: `Missing required fields: ${missing.join(", ")}`,
          });
        }

        const appointment = await service.bookAppointment({
          serviceCode: args.serviceCode as DentalService["code"],
          dentistId: args.dentistId as string,
          date: args.date as string,
          startTime: args.startTime as string,
          patientName: args.patientName as string,
          patientPhone: args.patientPhone as string,
        });

        return JSON.stringify({ success: true, appointment });
      }

      case "cancel_appointment": {
        if (!args.appointmentId || typeof args.appointmentId !== "string") {
          return JSON.stringify({
            success: false,
            error: "Missing or invalid required field: appointmentId is required.",
          });
        }

        const appointment = await service.cancelAppointment({
          appointmentId: args.appointmentId,
        });

        return JSON.stringify({
          success: true,
          appointment,
          message: `Appointment '${appointment.id}' has been successfully cancelled.`,
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
