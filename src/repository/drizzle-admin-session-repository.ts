import { and, eq, gt, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { randomUUID } from "node:crypto";
import type { AdminSessionRecord, AdminSessionRepository } from "./admin-session-repository";
import { adminSessions, type AdminSessionRow } from "./schema";
import { getDb } from "./db";

function toRecord(row: AdminSessionRow): AdminSessionRecord {
  const toIso = (value: string | Date) =>
    typeof value === "string" ? value : new Date(value).toISOString();
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    username: row.username,
    createdAt: toIso(row.createdAt),
    lastSeenAt: toIso(row.lastSeenAt),
    expiresAt: toIso(row.expiresAt),
  };
}

export class DrizzleAdminSessionRepository implements AdminSessionRepository {
  private readonly db: PostgresJsDatabase<Record<string, never>>;

  constructor(db?: PostgresJsDatabase<Record<string, never>>) {
    this.db = db ?? getDb();
  }

  async create(input: {
    tokenHash: string;
    username: string;
    nowIso: string;
    expiresAt: string;
  }): Promise<AdminSessionRecord> {
    const now = input.nowIso;
    const rows = await this.db
      .insert(adminSessions)
      .values({
        id: randomUUID(),
        tokenHash: input.tokenHash,
        username: input.username,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: input.expiresAt,
      })
      .returning();

    return toRecord(rows[0]!);
  }

  async findActiveByTokenHash(
    tokenHash: string,
    nowIso: string,
  ): Promise<AdminSessionRecord | null> {
    const rows = await this.db
      .select()
      .from(adminSessions)
      .where(and(eq(adminSessions.tokenHash, tokenHash), gt(adminSessions.expiresAt, nowIso)))
      .limit(1);

    return rows[0] ? toRecord(rows[0]) : null;
  }

  async touch(id: string, nowIso: string): Promise<void> {
    await this.db.update(adminSessions).set({ lastSeenAt: nowIso }).where(eq(adminSessions.id, id));
  }

  async revoke(tokenHash: string): Promise<void> {
    await this.db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash));
  }

  async revokeAll(): Promise<void> {
    await this.db.delete(adminSessions);
  }

  async purgeExpired(nowIso: string): Promise<void> {
    await this.db.delete(adminSessions).where(lte(adminSessions.expiresAt, nowIso));
  }
}
