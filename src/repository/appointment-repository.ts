import type { AppointmentRecord, AppointmentStatus } from "../domain/appointment";

/**
 * Filter criteria for querying appointments.
 * A `status` array matches any of the listed statuses.
 */
export type AppointmentFilter = {
  dentistId?: string;
  date?: string;
  status?: AppointmentStatus | AppointmentStatus[];
};

/**
 * Repository interface for appointment persistence operations.
 */
export type AppointmentRepository = {
  /**
   * Persists a new appointment record.
   */
  create(record: AppointmentRecord): Promise<AppointmentRecord>;

  /**
   * Atomically reserves a `pending` appointment if it does not overlap an active
   * (`pending` or `confirmed`) appointment for the same dentist and date.
   * Throws `SlotUnavailableError` when the interval is taken.
   */
  reserveIfAvailable(record: AppointmentRecord): Promise<AppointmentRecord>;

  /**
   * Marks a reserved appointment as `confirmed` and stores its calendar event ID.
   * Throws `AppointmentNotFoundError` when the appointment does not exist.
   */
  confirm(id: string, calendarEventId?: string): Promise<AppointmentRecord>;

  /**
   * Finds an appointment record by its unique ID.
   */
  findById(id: string): Promise<AppointmentRecord | null>;

  /**
   * Queries appointments matching the specified filter criteria.
   */
  find(filter: AppointmentFilter): Promise<AppointmentRecord[]>;

  /**
   * Updates the lifecycle status and cancellation metadata of an existing appointment.
   */
  updateStatus(
    id: string,
    status: AppointmentStatus,
    cancelledAt?: string,
  ): Promise<AppointmentRecord>;
};
