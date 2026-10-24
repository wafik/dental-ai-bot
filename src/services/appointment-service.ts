import { randomUUID } from "node:crypto";
import {
  DentistQualificationError,
  SlotUnavailableError,
  AppointmentNotFoundError,
  type AppointmentRecord,
  type BookAppointmentInput,
  type CancelAppointmentInput,
} from "../domain/appointment";
import { DENTISTS, SERVICES, type DentalService, type Dentist } from "../domain/clinic";
import {
  findAvailableSlots,
  type AvailableSlot,
  type Appointment,
  type WorkingHours,
} from "../domain/scheduling";
import type { CalendarProvider } from "../providers/calendar/calendar-provider";
import type { AppointmentRepository } from "../repository/appointment-repository";
import {
  DEFAULT_CLINIC_TIMEZONE,
  localToUtcIso,
  utcBusyIntervalToLocalAppointment,
} from "../utils/timezone";

export type AppointmentServiceConfig = {
  workingHours?: WorkingHours;
  timeZone?: string;
};

const DEFAULT_WORKING_HOURS: WorkingHours = {
  start: "09:00",
  end: "17:00",
};

function toMinutes(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new SlotUnavailableError("Time must use 24-hour HH:mm format");
  }

  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function toTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

export class AppointmentService {
  private readonly workingHours: WorkingHours;
  private readonly timeZone: string;

  constructor(
    private readonly repository: AppointmentRepository,
    private readonly calendarProvider: CalendarProvider,
    config?: AppointmentServiceConfig,
  ) {
    this.workingHours = config?.workingHours ?? DEFAULT_WORKING_HOURS;
    this.timeZone = config?.timeZone ?? DEFAULT_CLINIC_TIMEZONE;
  }

  /**
   * Calculates available appointment slots for a service, date, and optional dentist.
   */
  async getAvailableSlots(input: {
    serviceCode: DentalService["code"];
    date: string;
    dentistId?: string;
  }): Promise<AvailableSlot[]> {
    const service = SERVICES.find((s) => s.code === input.serviceCode);
    if (!service) {
      throw new Error(`Service '${input.serviceCode}' does not exist.`);
    }

    if (input.dentistId) {
      if (!service.eligibleDentistIds.includes(input.dentistId)) {
        throw new DentistQualificationError(input.dentistId, service.code);
      }
    }

    // Determine candidate dentists
    const candidateDentists: Dentist[] = DENTISTS.filter((dentist) => {
      if (input.dentistId && dentist.id !== input.dentistId) {
        return false;
      }
      return service.eligibleDentistIds.includes(dentist.id);
    });

    if (candidateDentists.length === 0) {
      return [];
    }

    // 1. Fetch confirmed internal appointments from repository for the date
    const repoAppointments = await this.repository.find({
      date: input.date,
      status: "confirmed",
    });

    const localRepoAppointments: Appointment[] = repoAppointments.map((rec) => ({
      date: rec.date,
      dentistId: rec.dentistId,
      start: rec.startTime,
      end: rec.endTime,
    }));

    // 2. Fetch external calendar busy intervals for each candidate dentist
    const calendarAppointments: Appointment[] = [];
    const dayStartUtc = localToUtcIso(input.date, "00:00", this.timeZone);
    const dayEndUtc = localToUtcIso(input.date, "23:59", this.timeZone);

    for (const dentist of candidateDentists) {
      const busyIntervals = await this.calendarProvider.getBusyIntervals({
        dentistId: dentist.id,
        start: dayStartUtc,
        end: dayEndUtc,
      });

      for (const busy of busyIntervals) {
        const localAppt = utcBusyIntervalToLocalAppointment(
          busy,
          dentist.id,
          input.date,
          this.timeZone,
        );
        if (localAppt) {
          calendarAppointments.push(localAppt);
        }
      }
    }

    // Combine all conflicting intervals
    const allAppointments = [...localRepoAppointments, ...calendarAppointments];

    // Compute slots using domain scheduling engine
    return findAvailableSlots({
      service,
      dentists: candidateDentists,
      workingHours: this.workingHours,
      appointments: allAppointments,
      date: input.date,
    });
  }

  /**
   * Validates and books a new appointment.
   */
  async bookAppointment(input: BookAppointmentInput): Promise<AppointmentRecord> {
    const service = SERVICES.find((s) => s.code === input.serviceCode);
    if (!service) {
      throw new Error(`Service '${input.serviceCode}' does not exist.`);
    }

    // Qualification check
    if (!service.eligibleDentistIds.includes(input.dentistId)) {
      throw new DentistQualificationError(input.dentistId, service.code);
    }

    // Validate 30-min alignment
    let startMinutes: number;
    try {
      startMinutes = toMinutes(input.startTime);
    } catch {
      throw new SlotUnavailableError("Invalid start time format");
    }

    if (startMinutes % 30 !== 0) {
      throw new SlotUnavailableError(
        "Appointment start time must be aligned to 30-minute intervals",
      );
    }

    const endMinutes = startMinutes + service.durationMinutes;
    const dayOpeningMinutes = toMinutes(this.workingHours.start);
    const dayClosingMinutes = toMinutes(this.workingHours.end);

    // Working hours bounds
    if (startMinutes < dayOpeningMinutes || endMinutes > dayClosingMinutes) {
      throw new SlotUnavailableError(
        `Appointment time ${input.startTime}-${toTime(endMinutes)} is outside working hours (${this.workingHours.start}-${this.workingHours.end})`,
      );
    }

    const endTime = toTime(endMinutes);

    // Availability verification
    const availableSlots = await this.getAvailableSlots({
      serviceCode: service.code,
      date: input.date,
      dentistId: input.dentistId,
    });

    const isAvailable = availableSlots.some(
      (slot) =>
        slot.dentistId === input.dentistId &&
        slot.date === input.date &&
        slot.start === input.startTime &&
        slot.end === endTime,
    );

    if (!isAvailable) {
      throw new SlotUnavailableError(
        `The requested slot on ${input.date} at ${input.startTime} is not available.`,
      );
    }

    // Convert local start & end to UTC for external calendar
    const startUtc = localToUtcIso(input.date, input.startTime, this.timeZone);
    const endUtc = localToUtcIso(input.date, endTime, this.timeZone);

    // Sync with external calendar
    const createdEvent = await this.calendarProvider.createEvent({
      dentistId: input.dentistId,
      summary: `Dental Appointment: ${service.name} - ${input.patientName}`,
      description: `Patient: ${input.patientName} (${input.patientPhone})\nService: ${service.name} (${service.code})`,
      start: startUtc,
      end: endUtc,
    });

    const now = new Date().toISOString();
    const newRecord: AppointmentRecord = {
      id: randomUUID(),
      patientName: input.patientName,
      patientPhone: input.patientPhone,
      serviceCode: service.code,
      dentistId: input.dentistId,
      date: input.date,
      startTime: input.startTime,
      endTime,
      status: "confirmed",
      calendarEventId: createdEvent.id,
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.create(newRecord);
  }

  /**
   * Cancels an existing appointment by ID idempotently.
   */
  async cancelAppointment(input: CancelAppointmentInput): Promise<AppointmentRecord> {
    const existing = await this.repository.findById(input.appointmentId);
    if (!existing) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    if (existing.status === "cancelled") {
      return existing;
    }

    const now = new Date().toISOString();
    return this.repository.updateStatus(input.appointmentId, "cancelled", now);
  }
}
