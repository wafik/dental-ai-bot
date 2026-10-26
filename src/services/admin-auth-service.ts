import { randomBytes } from "node:crypto";
import type { AdminSessionRepository } from "../repository/admin-session-repository";
import type { LoginAttemptRepository } from "../repository/login-attempt-repository";
import { verifyAdminPassword } from "../security/password";
import {
  ADMIN_IDLE_TTL_MS,
  ADMIN_SESSION_TTL_MS,
  hashSessionToken,
} from "../security/admin-cookie";

export type AdminAuthEnv = Record<string, string | undefined>;

export type LoginInput = { username: string; password: string };

export type LoginResult =
  | { ok: true; token: string; expiresAtMs: number }
  | { ok: false; error: "INVALID_CREDENTIALS" | "RATE_LIMITED" | "NOT_CONFIGURED" };

export type AdminAuthServiceOptions = {
  sessionRepository: AdminSessionRepository;
  attemptRepository: LoginAttemptRepository;
  env?: AdminAuthEnv;
  now?: () => Date;
};

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Authenticates the single deployment-configured admin account and manages
 * opaque, hash-at-rest sessions with persistent login throttling.
 */
export class AdminAuthService {
  private readonly sessionRepository: AdminSessionRepository;
  private readonly attemptRepository: LoginAttemptRepository;
  private readonly env: AdminAuthEnv;
  private readonly now: () => Date;

  constructor(options: AdminAuthServiceOptions) {
    this.sessionRepository = options.sessionRepository;
    this.attemptRepository = options.attemptRepository;
    this.env = options.env ?? process.env;
    this.now = options.now ?? (() => new Date());
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const username = this.env.ADMIN_USERNAME?.trim();
    const passwordHash = this.env.ADMIN_PASSWORD_HASH?.trim();
    if (!username || !passwordHash) {
      return { ok: false, error: "NOT_CONFIGURED" };
    }

    const now = this.now();
    const sinceIso = new Date(now.getTime() - FAILURE_WINDOW_MS).toISOString();
    const identifier = input.username.trim().toLowerCase() || "unknown";
    const failures = await this.attemptRepository.countFailures(identifier, sinceIso);
    if (failures >= MAX_FAILURES) {
      return { ok: false, error: "RATE_LIMITED" };
    }

    const usernameMatches = input.username.trim() === username;
    const passwordMatches = verifyAdminPassword(input.password, passwordHash);

    if (!usernameMatches || !passwordMatches) {
      await this.attemptRepository.recordFailure(identifier, now.toISOString());
      return { ok: false, error: "INVALID_CREDENTIALS" };
    }

    await this.attemptRepository.clear(identifier);
    await this.sessionRepository.revokeAll();

    const token = randomBytes(32).toString("base64url");
    const expiresAtMs = now.getTime() + ADMIN_SESSION_TTL_MS;
    await this.sessionRepository.create({
      tokenHash: hashSessionToken(token),
      username,
      nowIso: now.toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    });

    return { ok: true, token, expiresAtMs };
  }

  async validate(token: string): Promise<{ username: string } | null> {
    const tokenHash = hashSessionToken(token);
    const now = this.now();
    const record = await this.sessionRepository.findActiveByTokenHash(tokenHash, now.toISOString());

    if (!record) {
      return null;
    }

    const idleDeadline = new Date(record.lastSeenAt).getTime() + ADMIN_IDLE_TTL_MS;
    if (idleDeadline <= now.getTime()) {
      await this.sessionRepository.revoke(tokenHash);
      return null;
    }

    await this.sessionRepository.touch(record.id, now.toISOString());
    return { username: record.username };
  }

  async logout(token: string): Promise<void> {
    await this.sessionRepository.revoke(hashSessionToken(token));
  }
}
