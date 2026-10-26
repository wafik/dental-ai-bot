import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

type PostgresClient = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as {
  __dentalDb?: { client: PostgresClient; db: PostgresJsDatabase<Record<string, never>> };
};

/**
 * Shared PostgreSQL pool so route handlers do not open a connection each.
 */
export function getDb(): PostgresJsDatabase<Record<string, never>> {
  if (!globalForDb.__dentalDb) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) {
      throw new Error("DATABASE_URL is required for database-backed runtime.");
    }
    const client = postgres(url, { max: 10 });
    globalForDb.__dentalDb = {
      client,
      db: drizzle(client) as PostgresJsDatabase<Record<string, never>>,
    };
  }
  return globalForDb.__dentalDb.db;
}
