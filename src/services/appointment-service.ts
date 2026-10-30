import { randomUUID } from "node:crypto";
import {
  DentistQualificationError,
  SlotUnavailableError,
  AppointmentNotFoundError,
  type AppointmentRecord,
  type BookAppointmentInput,
  type CancelAppointmentInput,
} from "../domain/appointment";
import type { AppointmentCalendarSync } from "../domain/calendar-sync";
import { DENTISTS, SERVICES, type DentalService, type Dentist } from "../domain/clinic";
import {
  findAvailableSlots,
  type AvailableSlot,
  type Appointment,
  type WorkingHours,
} from "../domain/scheduling";
import type { CalendarProviderSet } from "../providers/calendar/calendar-provider";
import type { AppointmentRepository } from "../repository/appointment-repository";
import {
  attemptBooking,
  attemptCancellation,
  bookingEventInput,
  collectBusyIntervals,
  convergeAppointment,
  providerEntries,
  recordSyncOutcome,
} from "./calendar-sync-service";
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

function pendingSync(
  appointmentId: string,
  provider: AppointmentCalendarSync["provider"],
  operation: AppointmentCalendarSync["operation"],
  now: string,
): AppointmentCalendarSync {
  return {
    appointmentId,
    provider,
    operation,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    updatedAt: now,
  };
}

export class AppointmentService {
  private readonly calendarProviders: CalendarProviderSet;
  private readonly workingHours: WorkingHours;
  private readonly timeZone: string;

  /**
   * An empty provider set is explicit local-only mode (the `none` setting).
   * Every other configuration resolves both Google and Outlook at runtime.
   */
  constructor(
    private readonly repository: AppointmentRepository,
    calendarProviders: CalendarProviderSet = {},
    config?: AppointmentServiceConfig,
  ) {
    this.calendarProviders = calendarProviders;
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

    // 1. Fetch active internal appointments (pending reservations, confirmed
    //    bookings, and in-flight cancellations all occupy the dentist's time)
    const repoAppointments = await this.repository.find({
      date: input.date,
      status: ["pending", "confirmed", "cancelling"],
    });

    const localRepoAppointments: Appointment[] = repoAppointments.map((rec) => ({
      date: rec.date,
      dentistId: rec.dentistId,
      start: rec.startTime,
      end: rec.endTime,
    }));

    // 2. Fetch external calendar busy intervals for each candidate dentist from
    //    every configured provider; a slot is free only when all agree.
    const calendarAppointments: Appointment[] = [];
    const dayStartUtc = localToUtcIso(input.date, "00:00", this.timeZone);
    const dayEndUtc = localToUtcIso(input.date, "23:59", this.timeZone);

    for (const dentist of candidateDentists) {
      const busyIntervals = await collectBusyIntervals(this.calendarProviders, {
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
   *
   * The slot is reserved locally first. When external calendars are configured,
   * the booking is confirmed only after every provider accepted the event; a
   * partial or ambiguous outcome leaves the appointment `pending` with durable
   * per-provider retry state instead of reporting a false success.
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

    // Reserve the slot atomically before touching external calendars. The
    // reservation is what closes the race between the availability check above
    // and the write below; the pre-check only rejects obviously busy slots fast.
    const now = new Date().toISOString();
    const reserved = await this.repository.reserveIfAvailable({
      id: randomUUID(),
      patientName: input.patientName,
      patientPhone: input.patientPhone,
      serviceCode: service.code,
      dentistId: input.dentistId,
      date: input.date,
      startTime: input.startTime,
      endTime,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    const entries = providerEntries(this.calendarProviders);
    if (entries.length === 0) {
      // No external calendar is configured for this deployment.
      return this.repository.confirm(reserved.id);
    }

    // Persist the intent first so a crash mid-sync leaves durable retry state.
    const syncs = entries.map(([provider]) => pendingSync(reserved.id, provider, "book", now));
    await this.repository.saveCalendarSyncs(syncs);

    const eventInput = bookingEventInput(reserved, this.timeZone);
    await Promise.all(
      entries.map(async ([providerName, provider]) => {
        const sync = syncs.find((candidate) => candidate.provider === providerName)!;
        const outcome = await attemptBooking(provider, providerName, eventInput);
        await recordSyncOutcome(this.repository, sync, outcome);
      }),
    );

    await convergeAppointment(this.repository, reserved.id);
    return (await this.repository.findById(reserved.id)) ?? reserved;
  }

  /**
   * Cancels an existing appointment idempotently. The appointment stays
   * `cancelling` (and keeps its slot blocked) until every configured calendar
   * has removed its event; a repeated request resumes the same work.
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
    const entries = providerEntries(this.calendarProviders);
    if (entries.length === 0) {
      return this.repository.updateStatus(input.appointmentId, "cancelled", now);
    }

    const current =
      existing.status === "cancelling"
        ? existing
        : await this.repository.updateStatus(input.appointmentId, "cancelling");

    const existingSyncs = await this.repository.getCalendarSyncs(input.appointmentId);

    await Promise.all(
      entries.map(async ([providerName, provider]) => {
        const sync = existingSyncs.find((candidate) => candidate.provider === providerName);
        if (sync?.operation === "cancel" && sync.status === "succeeded") {
          return;
        }

        // Google accepts a caller-supplied event ID, so even an ambiguous create
        // has a deterministic ID that can be deleted idempotently. A Graph event
        // ID is assigned by the server and only known once creation succeeded.
        const eventId =
          sync?.eventId ??
          (providerName === "google" ? bookingEventInput(existing).idempotencyKey : undefined);

        if (!eventId) {
          const unresolved = sync?.status === "needs_manual_reconciliation";
          const status = unresolved ? "needs_manual_reconciliation" : "succeeded";
          const lastError = unresolved ? (sync.lastError ?? null) : null;
          if (sync) {
            await this.repository.updateCalendarSync(input.appointmentId, providerName, {
              operation: "cancel",
              status,
              lastError,
            });
          } else {
            // No tracked create exists for this provider; record the completed
            // cancellation so convergence can finish.
            await this.repository.saveCalendarSyncs([
              { ...pendingSync(input.appointmentId, providerName, "cancel", now), status },
            ]);
          }
          return;
        }

        const cancelSync = await this.repository.updateCalendarSync(
          input.appointmentId,
          providerName,
          { operation: "cancel", status: "pending", lastError: null, nextAttemptAt: now },
        );
        const outcome = await attemptCancellation(provider, providerName, {
          dentistId: current.dentistId,
          eventId,
        });
        await recordSyncOutcome(this.repository, cancelSync, outcome);
      }),
    );

    await convergeAppointment(this.repository, input.appointmentId);
    return (await this.repository.findById(input.appointmentId)) ?? current;
  }
}
