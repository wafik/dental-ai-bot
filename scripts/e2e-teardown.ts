import { spawnSync } from "node:child_process";

/**
 * Removes the disposable E2E PostgreSQL container.
 */
export default function globalTeardown(): void {
  spawnSync("docker", ["rm", "-f", "dental-e2e-pg"], { stdio: "ignore" });
}
