import { randomUUID } from "node:crypto";
import type { AdminSessionRecord, AdminSessionRepository } from "./admin-session-repository";
import type { LoginAttemptRepository } from "./login-attempt-repository";
import type { SecretMetadata, SecretRepository } from "./secret-repository";
import { encryptSecret, decryptSecret, type EncryptEnv } from "../security/encryption";

/**
 * In-memory secret repository. Values are encrypted with the same AES-GCM
 * envelope as production so tests exercise real failure paths.
 */
export class InMemorySecretRepository implements SecretRepository {
  private readonly rows = new Map<string, ReturnType<typeof encryptSecret>>();
  private readonly env: EncryptEnv;

  constructor(env: EncryptEnv = process.env) {
    this.env = env;
  }

  async getSecret(key: string): Promise<string | null> {
    const row = this.rows.get(key);
    return row ? decryptSecret(row, key, this.env) : null;
  }

  async setSecret(key: string, plaintext: string): Promise<void> {
    this.rows.set(key, encryptSecret(plaintext, key, this.env));
  }

  async getMetadata(keys: readonly string[]): Promise<Record<string, SecretMetadata>> {
    const result: Record<string, SecretMetadata> = {};
    for (const key of keys) {
      const row = this.rows.get(key);
      result[key] = row
        ? { key, isConfigured: true, updatedAt: new Date().toISOString() }
        : { key, isConfigured: false };
    }
    return result;
  }
}

export class InMemoryAdminSessionRepository implements AdminSessionRepository {
  private readonly sessions = new Map<string, AdminSessionRecord>();

  async create(input: {
    tokenHash: string;
    username: string;
    nowIso: string;
    expiresAt: string;
  }): Promise<AdminSessionRecord> {
    const now = input.nowIso;
    const record: AdminSessionRecord = {
      id: randomUUID(),
      tokenHash: input.tokenHash,
      username: input.username,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: input.expiresAt,
    };
    this.sessions.set(record.id, record);
    return { ...record };
  }

  async findActiveByTokenHash(
    tokenHash: string,
    nowIso: string,
  ): Promise<AdminSessionRecord | null> {
    for (const record of this.sessions.values()) {
      if (record.tokenHash === tokenHash && record.expiresAt > nowIso) {
        return { ...record };
      }
    }
    return null;
  }

  async touch(id: string, nowIso: string): Promise<void> {
    const record = this.sessions.get(id);
    if (record) {
      record.lastSeenAt = nowIso;
    }
  }

  async revoke(tokenHash: string): Promise<void> {
    for (const [id, record] of this.sessions.entries()) {
      if (record.tokenHash === tokenHash) {
        this.sessions.delete(id);
      }
    }
  }

  async revokeAll(): Promise<void> {
    this.sessions.clear();
  }

  async purgeExpired(nowIso: string): Promise<void> {
    for (const [id, record] of this.sessions.entries()) {
      if (record.expiresAt <= nowIso) {
        this.sessions.delete(id);
      }
    }
  }

  async listAll(): Promise<AdminSessionRecord[]> {
    return [...this.sessions.values()].map((record) => ({ ...record }));
  }
}

export class InMemoryLoginAttemptRepository implements LoginAttemptRepository {
  private readonly attempts: Array<{ identifier: string; at: string }> = [];

  async recordFailure(identifier: string, atIso: string): Promise<void> {
    this.attempts.push({ identifier, at: atIso });
  }

  async countFailures(identifier: string, sinceIso: string): Promise<number> {
    return this.attempts.filter(
      (attempt) => attempt.identifier === identifier && attempt.at > sinceIso,
    ).length;
  }

  async clear(identifier: string): Promise<void> {
    for (let index = this.attempts.length - 1; index >= 0; index -= 1) {
      if (this.attempts[index]!.identifier === identifier) {
        this.attempts.splice(index, 1);
      }
    }
  }
}
