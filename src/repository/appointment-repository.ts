import type { AppointmentRecord, AppointmentStatus } from "../domain/appointment";

/**
 * Filter criteria for querying appointments.
 */
export type AppointmentFilter = {
  dentistId?: string;
  date?: string;
  status?: AppointmentStatus;
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
