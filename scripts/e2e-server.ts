import { existsSync } from "node:fs";
import postgres from "postgres";

const CONTAINER = "dental-e2e-pg";
// 54999 sits outside the Windows Hyper-V reserved ranges, unlike 55432.
const PORT = 54999;
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/dental_e2e`;

function run(args: string[]): { status: number; stderr: string } {
  const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" });
  return {
    status: result.exitCode ?? 1,
    stderr: result.stderr.toString(),
  };
}

async function waitForPostgres(): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError = "unknown error";

  while (Date.now() < deadline) {
    try {
      const sql = postgres(DATABASE_URL, { max: 1, connect_timeout: 3 });
      try {
        await sql`SELECT 1`;
      } finally {
        await sql.end({ timeout: 1 });
      }
      return;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
      await Bun.sleep(1000);
    }
  }

  throw new Error(`PostgreSQL did not become ready: ${lastError}`);
}

async function main(): Promise<void> {
  if (!existsSync(".next")) {
    throw new Error("Production build not found. Run `bun run build` before E2E tests.");
  }

  run(["docker", "rm", "-f", CONTAINER]);

  const started = run([
    "docker",
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-e",
    "POSTGRES_PASSWORD=postgres",
    "-e",
    "POSTGRES_DB=dental_e2e",
    "-p",
    `${PORT}:5432`,
    "postgres:16-alpine",
  ]);

  if (started.status !== 0) {
    throw new Error(`Unable to start Docker container: ${started.stderr.trim()}`);
  }

  await waitForPostgres();

  const migration = run(["bun", "scripts/migrate.ts"]);
  if (migration.status !== 0) {
    throw new Error(`Migration failed: ${migration.stderr.trim()}`);
  }

  const server = Bun.spawn(["bun", "run", "start"], {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });

  const shutdown = () => {
    server.kill();
    run(["docker", "rm", "-f", CONTAINER]);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.exited;
}

main().catch((error: unknown) => {
  console.error("[e2e] failed:", error instanceof Error ? error.message : String(error));
  run(["docker", "rm", "-f", CONTAINER]);
  process.exit(1);
});
