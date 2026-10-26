import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { SecretMetadata, SecretRepository } from "./secret-repository";
import { encryptedSecrets } from "./schema";
import { encryptSecret, decryptSecret, type EncryptEnv } from "../security/encryption";
import { getDb } from "./db";

/**
 * PostgreSQL secret repository using AES-256-GCM authenticated encryption.
 * Plaintext is only ever returned to server-side provider construction.
 */
export class DrizzleSecretRepository implements SecretRepository {
  private readonly db: PostgresJsDatabase<Record<string, never>>;
  private readonly env: EncryptEnv;

  constructor(db?: PostgresJsDatabase<Record<string, never>>, env: EncryptEnv = process.env) {
    this.db = db ?? getDb();
    this.env = env;
  }

  async getSecret(key: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(encryptedSecrets)
      .where(eq(encryptedSecrets.key, key))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return decryptSecret(
      {
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.authTag,
        keyVersion: row.keyVersion,
      },
      key,
      this.env,
    );
  }

  async setSecret(key: string, plaintext: string): Promise<void> {
    const payload = encryptSecret(plaintext, key, this.env);
    const now = new Date().toISOString();

    await this.db
      .insert(encryptedSecrets)
      .values({
        key,
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        authTag: payload.authTag,
        keyVersion: payload.keyVersion,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: encryptedSecrets.key,
        set: {
          ciphertext: payload.ciphertext,
          iv: payload.iv,
          authTag: payload.authTag,
          keyVersion: payload.keyVersion,
          updatedAt: now,
        },
      });
  }

  async getMetadata(keys: readonly string[]): Promise<Record<string, SecretMetadata>> {
    const rows = await this.db.select().from(encryptedSecrets);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const result: Record<string, SecretMetadata> = {};

    for (const key of keys) {
      const row = byKey.get(key);
      result[key] = row
        ? {
            key,
            isConfigured: true,
            updatedAt:
              typeof row.updatedAt === "string"
                ? row.updatedAt
                : new Date(row.updatedAt).toISOString(),
          }
        : { key, isConfigured: false };
    }

    return result;
  }
}
