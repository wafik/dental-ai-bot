import { describe, expect, it } from "bun:test";
import { AdminAuthService } from "../src/services/admin-auth-service";
import {
  InMemoryAdminSessionRepository,
  InMemoryLoginAttemptRepository,
} from "../src/repository/in-memory-admin-repositories";
import { hashAdminPassword, verifyAdminPassword } from "../src/security/password";

const PASSWORD = "correct horse battery staple";

function makeService(startIso = "2026-10-26T00:00:00.000Z") {
  let now = new Date(startIso);
  const sessionRepository = new InMemoryAdminSessionRepository();
  const attemptRepository = new InMemoryLoginAttemptRepository();
  const auth = new AdminAuthService({
    sessionRepository,
    attemptRepository,
    env: { ADMIN_USERNAME: "admin", ADMIN_PASSWORD_HASH: hashAdminPassword(PASSWORD) },
    now: () => now,
  });
  return {
    auth,
    sessionRepository,
    attemptRepository,
    advanceMinutes: (minutes: number) => {
      now = new Date(now.getTime() + minutes * 60_000);
    },
  };
}

describe("AdminAuthService", () => {
  it("logs in with the configured account and stores only a session token hash", async () => {
    const { auth, sessionRepository } = makeService();
    const result = await auth.login({ username: "admin", password: PASSWORD });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sessions = await sessionRepository.listAll();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.tokenHash).not.toBe(result.token);
    expect(sessions[0]!.tokenHash).toHaveLength(64);
  });

  it("rejects wrong credentials without revealing which field failed", async () => {
    const { auth } = makeService();
    const wrongPassword = await auth.login({ username: "admin", password: "nope" });
    const wrongUsername = await auth.login({ username: "someone", password: PASSWORD });

    expect(wrongPassword).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });
    expect(wrongUsername).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });
  });

  it("throttles after ten failures within fifteen minutes", async () => {
    const { auth } = makeService();
    for (let index = 0; index < 10; index += 1) {
      await auth.login({ username: "admin", password: "wrong" });
    }

    expect(await auth.login({ username: "admin", password: PASSWORD })).toEqual({
      ok: false,
      error: "RATE_LIMITED",
    });
  });

  it("invalidates a session after thirty idle minutes", async () => {
    const { auth, advanceMinutes } = makeService();
    const result = await auth.login({ username: "admin", password: PASSWORD });
    if (!result.ok) throw new Error("login failed");

    advanceMinutes(31);
    expect(await auth.validate(result.token)).toBeNull();
  });

  it("expires a session after the absolute lifetime", async () => {
    const { auth, advanceMinutes } = makeService();
    const result = await auth.login({ username: "admin", password: PASSWORD });
    if (!result.ok) throw new Error("login failed");

    for (let index = 0; index < 8; index += 1) {
      advanceMinutes(29);
      await auth.validate(result.token);
    }
    advanceMinutes(31);

    expect(await auth.validate(result.token)).toBeNull();
  });

  it("revokes the previous session when a new login succeeds", async () => {
    const { auth } = makeService();
    const first = await auth.login({ username: "admin", password: PASSWORD });
    if (!first.ok) throw new Error("login failed");
    const second = await auth.login({ username: "admin", password: PASSWORD });
    if (!second.ok) throw new Error("login failed");

    expect(await auth.validate(first.token)).toBeNull();
    expect(await auth.validate(second.token)).not.toBeNull();
  });

  it("revokes a session on logout", async () => {
    const { auth } = makeService();
    const result = await auth.login({ username: "admin", password: PASSWORD });
    if (!result.ok) throw new Error("login failed");

    await auth.logout(result.token);
    expect(await auth.validate(result.token)).toBeNull();
  });

  it("fails closed when admin credentials are not configured", async () => {
    const auth = new AdminAuthService({
      sessionRepository: new InMemoryAdminSessionRepository(),
      attemptRepository: new InMemoryLoginAttemptRepository(),
      env: {},
    });

    expect(await auth.login({ username: "admin", password: "anything" })).toEqual({
      ok: false,
      error: "NOT_CONFIGURED",
    });
  });
});

describe("Admin password hashing", () => {
  it("verifies the correct password and rejects others", () => {
    const stored = hashAdminPassword(PASSWORD);
    expect(verifyAdminPassword(PASSWORD, stored)).toBe(true);
    expect(verifyAdminPassword("wrong", stored)).toBe(false);
  });

  it("rejects malformed stored hashes", () => {
    expect(verifyAdminPassword("x", "plaintext")).toBe(false);
    expect(verifyAdminPassword("x", "scrypt:not-base64:zzz")).toBe(false);
  });
});
