import { and, eq, gt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { randomUUID } from "node:crypto";
import type { LoginAttemptRepository } from "./login-attempt-repository";
import { adminLoginAttempts } from "./schema";
import { getDb } from "./db";

export class DrizzleLoginAttemptRepository implements LoginAttemptRepository {
  private readonly db: PostgresJsDatabase<Record<string, never>>;

  constructor(db?: PostgresJsDatabase<Record<string, never>>) {
    this.db = db ?? getDb();
  }

  async recordFailure(identifier: string, atIso: string): Promise<void> {
    await this.db.insert(adminLoginAttempts).values({
      id: randomUUID(),
      identifier,
      createdAt: atIso,
    });
  }

  async countFailures(identifier: string, sinceIso: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminLoginAttempts)
      .where(
        and(
          eq(adminLoginAttempts.identifier, identifier),
          gt(adminLoginAttempts.createdAt, sinceIso),
        ),
      );

    return rows[0]?.count ?? 0;
  }

  async clear(identifier: string): Promise<void> {
    await this.db.delete(adminLoginAttempts).where(eq(adminLoginAttempts.identifier, identifier));
  }
}
