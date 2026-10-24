import {
  AppointmentNotFoundError,
  type AppointmentRecord,
  type AppointmentStatus,
} from "../domain/appointment";
import type { AppointmentFilter, AppointmentRepository } from "./appointment-repository";

/**
 * In-memory appointment repository backed by a Map for offline testing.
 */
export class InMemoryAppointmentRepository implements AppointmentRepository {
  private readonly records = new Map<string, AppointmentRecord>();

  async create(record: AppointmentRecord): Promise<AppointmentRecord> {
    if (record.status === "confirmed") {
      for (const existing of this.records.values()) {
        if (
          existing.dentistId === record.dentistId &&
          existing.date === record.date &&
          existing.status === "confirmed"
        ) {
          // Check for overlapping intervals
          if (record.startTime < existing.endTime && record.endTime > existing.startTime) {
            throw new Error(
              `Slot conflict: Dentist '${record.dentistId}' already has a confirmed booking from ${existing.startTime} to ${existing.endTime} on ${record.date}.`,
            );
          }
        }
      }
    }

    const clone: AppointmentRecord = { ...record };
    this.records.set(clone.id, clone);
    return { ...clone };
  }

  async findById(id: string): Promise<AppointmentRecord | null> {
    const record = this.records.get(id);
    if (!record) {
      return null;
    }
    return { ...record };
  }

  async find(filter: AppointmentFilter): Promise<AppointmentRecord[]> {
    const results: AppointmentRecord[] = [];

    for (const record of this.records.values()) {
      if (filter.dentistId !== undefined && record.dentistId !== filter.dentistId) {
        continue;
      }
      if (filter.date !== undefined && record.date !== filter.date) {
        continue;
      }
      if (filter.status !== undefined && record.status !== filter.status) {
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
