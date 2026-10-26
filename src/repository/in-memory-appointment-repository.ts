import {
  AppointmentNotFoundError,
  SlotUnavailableError,
  type AppointmentRecord,
  type AppointmentStatus,
} from "../domain/appointment";
import type { AppointmentFilter, AppointmentRepository } from "./appointment-repository";

/** Statuses that occupy a dentist's time. */
const ACTIVE_STATUSES: readonly AppointmentStatus[] = ["pending", "confirmed"];

function isActive(status: AppointmentStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

function overlaps(
  a: Pick<AppointmentRecord, "dentistId" | "date" | "startTime" | "endTime">,
  b: Pick<AppointmentRecord, "dentistId" | "date" | "startTime" | "endTime">,
): boolean {
  return (
    a.dentistId === b.dentistId &&
    a.date === b.date &&
    a.startTime < b.endTime &&
    a.endTime > b.startTime
  );
}

/**
 * In-memory appointment repository backed by a Map for offline testing.
 */
export class InMemoryAppointmentRepository implements AppointmentRepository {
  private readonly records = new Map<string, AppointmentRecord>();

  async create(record: AppointmentRecord): Promise<AppointmentRecord> {
    if (isActive(record.status)) {
      for (const existing of this.records.values()) {
        if (isActive(existing.status) && overlaps(record, existing)) {
          throw new SlotUnavailableError(
            `Slot conflict: Dentist '${record.dentistId}' already has a booking from ${existing.startTime} to ${existing.endTime} on ${record.date}.`,
          );
        }
      }
    }

    const clone: AppointmentRecord = { ...record };
    this.records.set(clone.id, clone);
    return { ...clone };
  }

  async reserveIfAvailable(record: AppointmentRecord): Promise<AppointmentRecord> {
    // The check and the insert below run in one synchronous section: there is no
    // `await` between them, so single-threaded Bun cannot interleave another
    // reservation between the conflict check and the write.
    for (const existing of this.records.values()) {
      if (isActive(existing.status) && overlaps(record, existing)) {
        throw new SlotUnavailableError(
          `The requested slot on ${record.date} at ${record.startTime} is not available.`,
        );
      }
    }

    const reserved: AppointmentRecord = { ...record, status: "pending" };
    this.records.set(reserved.id, reserved);
    return { ...reserved };
  }

  async confirm(id: string, calendarEventId?: string): Promise<AppointmentRecord> {
    const existing = this.records.get(id);
    if (!existing) {
      throw new AppointmentNotFoundError(id);
    }

    const updated: AppointmentRecord = {
      ...existing,
      status: "confirmed",
      calendarEventId: calendarEventId ?? existing.calendarEventId,
      updatedAt: new Date().toISOString(),
    };

    this.records.set(id, updated);
    return { ...updated };
  }

  async findById(id: string): Promise<AppointmentRecord | null> {
    const record = this.records.get(id);
    if (!record) {
      return null;
    }
    return { ...record };
  }

  async find(filter: AppointmentFilter): Promise<AppointmentRecord[]> {
    const statuses =
      filter.status === undefined
        ? undefined
        : Array.isArray(filter.status)
          ? filter.status
          : [filter.status];

    const results: AppointmentRecord[] = [];

    for (const record of this.records.values()) {
      if (filter.dentistId !== undefined && record.dentistId !== filter.dentistId) {
        continue;
      }
      if (filter.date !== undefined && record.date !== filter.date) {
        continue;
      }
      if (statuses !== undefined && !statuses.includes(record.status)) {
        continue;
      }

      results.push({ ...record });
    }

    return results;
  }

  async updateStatus(
    id: string,
    status: AppointmentStatus,
    cancelledAt?: string,
  ): Promise<AppointmentRecord> {
    const existing = this.records.get(id);
    if (!existing) {
      throw new AppointmentNotFoundError(id);
    }

    const now = new Date().toISOString();
    const updated: AppointmentRecord = {
      ...existing,
      status,
      updatedAt: now,
      ...(cancelledAt !== undefined
        ? { cancelledAt }
        : status === "cancelled"
          ? { cancelledAt: existing.cancelledAt ?? now }
          : { cancelledAt: undefined }),
    };

    this.records.set(id, updated);
    return { ...updated };
  }
}
