import { and, eq, type SQL } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  AppointmentNotFoundError,
  type AppointmentRecord,
  type AppointmentStatus,
} from "../domain/appointment";
import type { DentalService } from "../domain/clinic";
import type { AppointmentFilter, AppointmentRepository } from "./appointment-repository";
import { appointments, type AppointmentRow } from "./schema";

/**
 * PostgreSQL appointment repository implementation backed by Drizzle ORM.
 */
export class DrizzleAppointmentRepository implements AppointmentRepository {
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle schema-agnostic DB type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: PostgresJsDatabase<any>;

  // biome-ignore lint/suspicious/noExplicitAny: Drizzle schema-agnostic DB type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db?: PostgresJsDatabase<any>) {
    if (db) {
      this.db = db;
    } else {
      const connectionString =
        process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "postgres://localhost:5432/dental";
      const client = postgres(connectionString);
      this.db = drizzle(client);
    }
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
      conditions.push(eq(appointments.status, filter.status));
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
