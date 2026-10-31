import type { AppointmentRecord, AppointmentStatus } from "../domain/appointment";
import type { AppointmentCalendarSync, CalendarSyncPatch } from "../domain/calendar-sync";

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
   * appointment for the same dentist and date. Throws `SlotUnavailableError`
   * when the interval is taken.
   */
  reserveIfAvailable(record: AppointmentRecord): Promise<AppointmentRecord>;

  /**
   * Marks a reserved appointment as `confirmed`.
   * Throws `AppointmentNotFoundError` when the appointment does not exist.
   */
  confirm(id: string): Promise<AppointmentRecord>;

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

  /**
   * Upserts per-provider synchronization rows for one appointment. Used to
   * persist sync intent before any remote write.
   */
  saveCalendarSyncs(syncs: readonly AppointmentCalendarSync[]): Promise<void>;

  /**
   * Loads the synchronization rows for one appointment.
   */
  getCalendarSyncs(appointmentId: string): Promise<AppointmentCalendarSync[]>;

  /**
   * Applies a partial update to one provider's synchronization row.
   */
  updateCalendarSync(
    appointmentId: string,
    provider: string,
    patch: CalendarSyncPatch,
  ): Promise<AppointmentCalendarSync>;

  /**
   * Atomically claims up to `limit` due rows by pushing their retry time out
   * to `leaseUntil`. Concurrent callers only ever claim a row once.
   */
  claimCalendarSyncs(
    limit: number,
    now: string,
    leaseUntil: string,
  ): Promise<AppointmentCalendarSync[]>;
};
