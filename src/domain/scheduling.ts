import type { DentalService, Dentist } from "./clinic";

export type WorkingHours = {
  start: string;
  end: string;
};

export type Appointment = {
  date: string;
  dentistId: string;
  start: string;
  end: string;
};

export type AvailableSlot = Appointment;

export type FindAvailableSlotsInput = {
  service: DentalService;
  dentists: Dentist[];
  workingHours: WorkingHours;
  appointments: Appointment[];
  date: string;
};

const SLOT_INTERVAL_MINUTES = 30;

function toMinutes(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Time must use 24-hour HH:mm format");
  }

  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

function toTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

export function findAvailableSlots({
  service,
  dentists,
  workingHours,
  appointments,
  date,
}: FindAvailableSlotsInput): AvailableSlot[] {
  const dayStart = toMinutes(workingHours.start);
  const dayEnd = toMinutes(workingHours.end);
  const slots: AvailableSlot[] = [];

  for (const dentist of dentists) {
    if (!service.eligibleDentistIds.includes(dentist.id)) continue;

    for (
      let start = dayStart;
      start + service.durationMinutes <= dayEnd;
      start += SLOT_INTERVAL_MINUTES
    ) {
      const end = start + service.durationMinutes;
      const overlaps = appointments.some(
        (appointment) =>
          appointment.date === date &&
          appointment.dentistId === dentist.id &&
          start < toMinutes(appointment.end) &&
          toMinutes(appointment.start) < end,
      );

      if (!overlaps) {
        slots.push({ date, start: toTime(start), end: toTime(end), dentistId: dentist.id });
      }
    }
  }

  return slots;
}
