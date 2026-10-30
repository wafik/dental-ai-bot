import type { DentalService } from "./clinic";

/**
 * Valid appointment lifecycle statuses.
 *
 * - `pending`: reserved atomically, awaiting external calendar synchronization.
 * - `confirmed`: synchronized to every configured calendar; visible to the public.
 * - `cancelling`: cancellation requested; external calendar events are being removed.
 * - `cancelled`: cancelled by staff or patient.
 * - `failed`: legacy sync-failure status; no longer produced, kept for stored rows.
 */
export type AppointmentStatus = "pending" | "confirmed" | "cancelling" | "cancelled" | "failed";

/**
 * Statuses that occupy a dentist's time and must block overlapping bookings.
 * `cancelling` still blocks: the external event may not be removed yet.
 */
export const ACTIVE_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "pending",
  "confirmed",
  "cancelling",
];

/**
 * Domain entity representing an appointment record in the clinic.
 */
export type AppointmentRecord = {
  id: string;
  patientName: string;
  patientPhone: string;
  serviceCode: DentalService["code"];
  dentistId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: AppointmentStatus;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
  cancelledAt?: string; // ISO 8601 UTC
};

/**
 * Input payload for booking a new dental appointment.
 */
export type BookAppointmentInput = {
  patientName: string;
  patientPhone: string;
  serviceCode: DentalService["code"];
  dentistId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
};

/**
 * Input payload for cancelling an existing appointment.
 */
export type CancelAppointmentInput = {
  appointmentId: string;
  reason?: string;
};

/**
 * Base domain error for appointment operations.
 */
export class AppointmentError extends Error {
  readonly code: string;

  constructor(message: string, code = "APPOINTMENT_ERROR") {
    super(message);
    this.name = "AppointmentError";
    this.code = code;
  }
}

/**
 * Thrown when a dentist is not qualified to perform the requested dental service.
 */
export class DentistQualificationError extends AppointmentError {
  readonly dentistId?: string;
  readonly serviceCode?: string;

  constructor(dentistId?: string, serviceCode?: string) {
    const message =
      dentistId && serviceCode
        ? `Dentist '${dentistId}' is not qualified to perform Service ${serviceCode}.`
        : "Dentist is not qualified for this dental service.";
    super(message, "DENTIST_NOT_QUALIFIED");
    this.name = "DentistQualificationError";
    this.dentistId = dentistId;
    this.serviceCode = serviceCode;
  }
}

/**
 * Thrown when the requested time slot is unavailable or conflicts with existing schedules.
 */
export class SlotUnavailableError extends AppointmentError {
  constructor(message = "Selected appointment slot is not available") {
    super(message, "SLOT_UNAVAILABLE");
    this.name = "SlotUnavailableError";
  }
}

/**
 * Thrown when an appointment cannot be found by its identifier.
 */
export class AppointmentNotFoundError extends AppointmentError {
  readonly appointmentId?: string;

  constructor(id?: string) {
    const message = id ? `Appointment with ID '${id}' was not found.` : "Appointment not found.";
    super(message, "APPOINTMENT_NOT_FOUND");
    this.name = "AppointmentNotFoundError";
    this.appointmentId = id;
  }
}
