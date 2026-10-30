import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  AppointmentNotFoundError,
  SlotUnavailableError,
  type AppointmentRecord,
  type AppointmentStatus,
} from "../domain/appointment";
import type { DentalService } from "../domain/clinic";
import type {
  AppointmentCalendarSync,
  CalendarSyncOperation,
  CalendarSyncPatch,
  CalendarSyncStatus,
} from "../domain/calendar-sync";
import type { CalendarProviderName } from "../providers/calendar/calendar-provider";
import type { AppointmentFilter, AppointmentRepository } from "./appointment-repository";
import { getDb } from "./db";
import {
  appointmentCalendarSyncs,
  appointments,
  type AppointmentCalendarSyncRow,
  type AppointmentRow,
} from "./schema";

/** Statuses that occupy a dentist's time and must block overlapping reservations. */
const ACTIVE_STATUSES: AppointmentStatus[] = ["pending", "confirmed", "cancelling"];

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
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        cancelledAt: null,
      });
    });

    return { ...record, status: "pending" };
  }

  async confirm(id: string): Promise<AppointmentRecord> {
    const now = new Date().toISOString();
    const updatedRows = await this.db
      .update(appointments)
      .set({ status: "confirmed", updatedAt: now })
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

  async saveCalendarSyncs(syncs: readonly AppointmentCalendarSync[]): Promise<void> {
    if (syncs.length === 0) {
      return;
    }

    for (const sync of syncs) {
      await this.db
        .insert(appointmentCalendarSyncs)
        .values({
          appointmentId: sync.appointmentId,
          provider: sync.provider,
          operation: sync.operation,
          status: sync.status,
          eventId: sync.eventId ?? null,
          attempts: sync.attempts,
          nextAttemptAt: sync.nextAttemptAt,
          lastError: sync.lastError ?? null,
          updatedAt: sync.updatedAt,
        })
        .onConflictDoNothing();
    }
  }

  async getCalendarSyncs(appointmentId: string): Promise<AppointmentCalendarSync[]> {
    const rows = await this.db
      .select()
      .from(appointmentCalendarSyncs)
      .where(eq(appointmentCalendarSyncs.appointmentId, appointmentId));

    return rows.map((row) => this.toSync(row));
  }

  async updateCalendarSync(
    appointmentId: string,
    provider: string,
    patch: CalendarSyncPatch,
  ): Promise<AppointmentCalendarSync> {
    const now = new Date().toISOString();
    const updatedRows = await this.db
      .update(appointmentCalendarSyncs)
      .set({
        updatedAt: now,
        ...(patch.operation !== undefined ? { operation: patch.operation } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.eventId !== undefined ? { eventId: patch.eventId } : {}),
        ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
        ...(patch.lastError !== undefined ? { lastError: patch.lastError } : {}),
        ...(patch.nextAttemptAt !== undefined ? { nextAttemptAt: patch.nextAttemptAt } : {}),
      })
      .where(
        and(
          eq(appointmentCalendarSyncs.appointmentId, appointmentId),
          eq(appointmentCalendarSyncs.provider, provider),
        ),
      )
      .returning();

    if (updatedRows.length === 0) {
      throw new AppointmentNotFoundError(appointmentId);
    }

    return this.toSync(updatedRows[0]!);
  }

  /**
   * Claims due rows in one statement so two workers cannot both claim them.
   * `FOR UPDATE SKIP LOCKED` keeps the claim non-blocking under contention.
   */
  async claimCalendarSyncs(
    limit: number,
    now: string,
    leaseUntil: string,
  ): Promise<AppointmentCalendarSync[]> {
    const rows = await this.db.execute(sql`
      UPDATE appointment_calendar_syncs
      SET next_attempt_at = ${leaseUntil}, updated_at = ${now}
      WHERE (appointment_id, provider) IN (
        SELECT appointment_id, provider
        FROM appointment_calendar_syncs
        WHERE status = 'pending' AND next_attempt_at <= ${now}
        ORDER BY next_attempt_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => this.toSyncRow(row));
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

  private toSync(row: AppointmentCalendarSyncRow): AppointmentCalendarSync {
    return {
      appointmentId: row.appointmentId,
      provider: row.provider as CalendarProviderName,
      operation: row.operation as CalendarSyncOperation,
      status: row.status as CalendarSyncStatus,
      eventId: row.eventId ?? undefined,
      attempts: row.attempts,
      nextAttemptAt: toIso(row.nextAttemptAt),
      lastError: row.lastError ?? undefined,
      updatedAt: toIso(row.updatedAt),
    };
  }

  /** Maps a raw `db.execute` row (snake_case, driver-decoded dates). */
  private toSyncRow(row: Record<string, unknown>): AppointmentCalendarSync {
    return {
      appointmentId: String(row.appointment_id),
      provider: String(row.provider) as CalendarProviderName,
      operation: String(row.operation) as CalendarSyncOperation,
      status: String(row.status) as CalendarSyncStatus,
      eventId: row.event_id ? String(row.event_id) : undefined,
      attempts: Number(row.attempts),
      nextAttemptAt: toIso(row.next_attempt_at),
      lastError: row.last_error ? String(row.last_error) : undefined,
      updatedAt: toIso(row.updated_at),
    };
  }
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
