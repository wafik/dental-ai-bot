import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export type EncryptEnv = Record<string, string | undefined>;

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
};

function parseKey(raw: string | undefined, name: string): Buffer {
  const value = raw?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  const buffer = /^[0-9a-fA-F]{64}$/.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");

  if (buffer.length !== 32) {
    throw new Error(`${name} must be exactly 32 bytes.`);
  }
  return buffer;
}

function activeKey(env: EncryptEnv): Buffer {
  return parseKey(env.SETTINGS_ENCRYPTION_KEY, "SETTINGS_ENCRYPTION_KEY");
}

function keyForVersion(version: string, env: EncryptEnv): Buffer {
  if (version === "v1") {
    return activeKey(env);
  }
  if (version === "v0") {
    return parseKey(env.SETTINGS_ENCRYPTION_KEY_PREVIOUS, "SETTINGS_ENCRYPTION_KEY_PREVIOUS");
  }
  throw new Error("Unknown secret encryption key version.");
}

/**
 * Encrypts a secret with AES-256-GCM. The secret key identifier is bound as
 * additional authenticated data so ciphertext cannot be moved between rows.
 */
export function encryptSecret(
  plaintext: string,
  aad: string,
  env: EncryptEnv = process.env,
): EncryptedPayload {
  const key = activeKey(env);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  cipher.setAAD(Buffer.from(aad, "utf8"));

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: "v1",
  };
}

/**
 * Decrypts a stored secret. Throws a generic error on tampering or an
 * unknown key version so callers never leak cryptographic detail.
 */
export function decryptSecret(
  payload: EncryptedPayload,
  aad: string,
  env: EncryptEnv = process.env,
): string {
  try {
    const key = keyForVersion(payload.keyVersion, env);
    const iv = Buffer.from(payload.iv, "base64");
    if (iv.length !== IV_LENGTH) {
      throw new Error("Invalid IV");
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  } catch {
    throw new Error("Unable to decrypt stored secret.");
  }
}
