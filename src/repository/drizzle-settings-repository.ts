import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { randomUUID } from "node:crypto";
import type {
  DentistCalendarMappingRecord,
  SettingsRepository,
  UpsertDentistCalendarMappingInput,
} from "./settings-repository";
import { clinicSettings, dentistCalendarMappings, type DentistCalendarMappingRow } from "./schema";
import { getDb } from "./db";

/**
 * PostgreSQL settings and calendar mapping repository backed by Drizzle ORM.
 */
export class DrizzleSettingsRepository implements SettingsRepository {
  private readonly db: PostgresJsDatabase<Record<string, never>>;

  constructor(db?: PostgresJsDatabase<Record<string, never>>) {
    this.db = db ?? getDb();
  }

  async getSetting(key: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(clinicSettings)
      .where(eq(clinicSettings.key, key))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    return rows[0]!.value;
  }

  async setSetting(key: string, value: string, description?: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .insert(clinicSettings)
      .values({
        key,
        value,
        description: description ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: clinicSettings.key,
        set: {
          value,
          description: description ?? null,
          updatedAt: now,
        },
      });
  }

  async getDentistCalendarMappings(
    provider?: "google" | "outlook",
  ): Promise<DentistCalendarMappingRecord[]> {
    let query = this.db.select().from(dentistCalendarMappings);

    if (provider) {
      // @ts-expect-error Drizzle query builder condition narrowing
      query = query.where(
        and(
          eq(dentistCalendarMappings.isActive, true),
          eq(dentistCalendarMappings.provider, provider),
        ),
      );
    } else {
      // @ts-expect-error Drizzle query builder condition narrowing
      query = query.where(eq(dentistCalendarMappings.isActive, true));
    }

    const rows = await query;
    return rows.map((r: DentistCalendarMappingRow) => this.toMappingRecord(r));
  }

  async getAllDentistCalendarMappings(): Promise<DentistCalendarMappingRecord[]> {
    const rows = await this.db.select().from(dentistCalendarMappings);
    return rows.map((row: DentistCalendarMappingRow) => this.toMappingRecord(row));
  }

  async upsertDentistCalendarMapping(
    input: UpsertDentistCalendarMappingInput,
  ): Promise<DentistCalendarMappingRecord> {
    const now = new Date().toISOString();

    // Check if existing mapping exists for this dentist and provider
    const existing = await this.db
      .select()
      .from(dentistCalendarMappings)
      .where(
        and(
          eq(dentistCalendarMappings.dentistId, input.dentistId),
          eq(dentistCalendarMappings.provider, input.provider),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const targetId = existing[0]!.id;
      const updatedRows = await this.db
        .update(dentistCalendarMappings)
        .set({
          calendarId: input.calendarId,
          isActive: input.isActive ?? existing[0]!.isActive,
          updatedAt: now,
        })
        .where(eq(dentistCalendarMappings.id, targetId))
        .returning();

      return this.toMappingRecord(updatedRows[0]!);
    }

    const id = randomUUID();
    const inserted = await this.db
      .insert(dentistCalendarMappings)
      .values({
        id,
        dentistId: input.dentistId,
        provider: input.provider,
        calendarId: input.calendarId,
        isActive: input.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return this.toMappingRecord(inserted[0]!);
  }

  private toMappingRecord(row: DentistCalendarMappingRow): DentistCalendarMappingRecord {
    return {
      id: row.id,
      dentistId: row.dentistId,
      provider: row.provider as "google" | "outlook",
      calendarId: row.calendarId,
      isActive: row.isActive,
      createdAt:
        typeof row.createdAt === "string" ? row.createdAt : new Date(row.createdAt).toISOString(),
      updatedAt:
        typeof row.updatedAt === "string" ? row.updatedAt : new Date(row.updatedAt).toISOString(),
    };
  }
}
