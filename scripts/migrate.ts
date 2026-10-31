import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

/**
 * Applies SQL migrations in filename order, skipping already-applied files.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const dir = path.resolve(process.cwd(), "drizzle");
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const sql = postgres(url, { max: 1 });

  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
      name varchar(255) PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;

    const applied = await sql<{ name: string }[]>`SELECT name FROM schema_migrations`;
    const appliedNames = new Set(applied.map((row) => row.name));

    for (const file of files) {
      if (appliedNames.has(file)) {
        console.log(`[migrate] skip ${file}`);
        continue;
      }
      const contents = readFileSync(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(contents);
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      });
      console.log(`[migrate] applied ${file}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error("[migrate] failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
