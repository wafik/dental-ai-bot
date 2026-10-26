import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  AppointmentNotFoundError,
  SlotUnavailableError,
  type AppointmentRecord,
  type AppointmentStatus,
} from "../domain/appointment";
import type { DentalService } from "../domain/clinic";
import type { AppointmentFilter, AppointmentRepository } from "./appointment-repository";
import { getDb } from "./db";
import { appointments, type AppointmentRow } from "./schema";

/** Statuses that occupy a dentist's time and must block overlapping reservations. */
const ACTIVE_STATUSES: AppointmentStatus[] = ["pending", "confirmed"];

/**
 * PostgreSQL appointment repository implementation backed by Drizzle ORM.
 */
export class DrizzleAppointmentRepository implements AppointmentRepository {
  private readonly db: PostgresJsDatabase<Record<string, never>>;

  constructor(db?: PostgresJsDatabase<Record<string, never>>) {
    this.db = db ?? getDb();
  }

  async create(record: AppointmentRecord): Promise<AppointmentRecord> {
    await this.db.insert(appointments).values({
      id: record.id,
      patientName: record.patientName,
      patientPhone: record.patientPhone,
      serviceCode: record.serviceCode,
      dentistId: record.dentistId,
      date: record.date,
      startTime: record.startTime,
      endTime: record.endTime,
      status: record.status,
      calendarEventId: record.calendarEventId ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      cancelledAt: record.cancelledAt ?? null,
    });

    return { ...record };
  }

  /**
   * Reserves a `pending` row inside a transaction guarded by a per-dentist/date
   * advisory lock, so concurrent API instances cannot both pass the overlap check.
   * The lock is released automatically when the transaction ends.
   */
  async reserveIfAvailable(record: AppointmentRecord): Promise<AppointmentRecord> {
    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`${record.dentistId}:${record.date}`}))`,
      );

      const existing = await tx
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.dentistId, record.dentistId),
            eq(appointments.date, record.date),
            inArray(appointments.status, ACTIVE_STATUSES),
          ),
        );

      const conflict = existing.some(
        (row: AppointmentRow) => record.startTime < row.endTime && record.endTime > row.startTime,
      );

      if (conflict) {
        throw new SlotUnavailableError(
          `The requested slot on ${record.date} at ${record.startTime} is not available.`,
        );
      }

      await tx.insert(appointments).values({
        id: record.id,
        patientName: record.patientName,
        patientPhone: record.patientPhone,
        serviceCode: record.serviceCode,
        dentistId: record.dentistId,
        date: record.date,
        startTime: record.startTime,
        endTime: record.endTime,
        status: "pending",
        calendarEventId: null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        cancelledAt: null,
      });
    });

    return { ...record, status: "pending" };
  }

  async confirm(id: string, calendarEventId?: string): Promise<AppointmentRecord> {
    const now = new Date().toISOString();
    const updatedRows = await this.db
      .update(appointments)
      .set({
        status: "confirmed",
        updatedAt: now,
        ...(calendarEventId !== undefined ? { calendarEventId } : {}),
      })
      .where(eq(appointments.id, id))
      .returning();

    if (updatedRows.length === 0) {
      throw new AppointmentNotFoundError(id);
    }

    return this.toRecord(updatedRows[0]!);
  }

  async findById(id: string): Promise<AppointmentRecord | null> {
    const rows = await this.db.select().from(appointments).where(eq(appointments.id, id)).limit(1);

    if (rows.length === 0) {
      return null;
    }

    return this.toRecord(rows[0]!);
  }

  async find(filter: AppointmentFilter): Promise<AppointmentRecord[]> {
    const conditions: SQL[] = [];

    if (filter.dentistId !== undefined) {
      conditions.push(eq(appointments.dentistId, filter.dentistId));
    }
    if (filter.date !== undefined) {
      conditions.push(eq(appointments.date, filter.date));
    }
    if (filter.status !== undefined) {
      conditions.push(
        Array.isArray(filter.status)
          ? inArray(appointments.status, filter.status)
          : eq(appointments.status, filter.status),
      );
    }

    let query = this.db.select().from(appointments);
    if (conditions.length > 0) {
      // @ts-expect-error Drizzle query builder condition narrowing
      query = query.where(and(...conditions));
    }

    const rows = await query;
    return rows.map((row: AppointmentRow) => this.toRecord(row));
  }

  async updateStatus(
    id: string,
    status: AppointmentStatus,
    cancelledAt?: string,
  ): Promise<AppointmentRecord> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new AppointmentNotFoundError(id);
    }

    const now = new Date().toISOString();
    const resolvedCancelledAt =
      cancelledAt !== undefined
        ? cancelledAt
        : status === "cancelled"
          ? (existing.cancelledAt ?? now)
          : null;

    const updatedRows = await this.db
      .update(appointments)
      .set({
        status,
        updatedAt: now,
        cancelledAt: resolvedCancelledAt,
      })
      .where(eq(appointments.id, id))
      .returning();

    if (updatedRows.length === 0) {
      throw new AppointmentNotFoundError(id);
    }

    return this.toRecord(updatedRows[0]!);
  }

  private toRecord(row: AppointmentRow): AppointmentRecord {
    return {
      id: row.id,
      patientName: row.patientName,
      patientPhone: row.patientPhone,
      serviceCode: row.serviceCode as DentalService["code"],
      dentistId: row.dentistId,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      status: row.status as AppointmentStatus,
      calendarEventId: row.calendarEventId ?? undefined,
      createdAt:
        typeof row.createdAt === "string" ? row.createdAt : new Date(row.createdAt).toISOString(),
      updatedAt:
        typeof row.updatedAt === "string" ? row.updatedAt : new Date(row.updatedAt).toISOString(),
      cancelledAt: row.cancelledAt
        ? typeof row.cancelledAt === "string"
          ? row.cancelledAt
          : new Date(row.cancelledAt).toISOString()
        : undefined,
    };
  }
}
