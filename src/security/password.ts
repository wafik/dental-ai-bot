import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PREFIX = "scrypt";
const KEY_LENGTH = 64;

/**
 * Produces a salted scrypt hash in the form scrypt:<salt-b64>:<hash-b64>.
 */
export function hashAdminPassword(password: string, salt: Buffer = randomBytes(16)): string {
  const hash = scryptSync(password, salt, KEY_LENGTH);
  return `${PREFIX}:${salt.toString("base64")}:${hash.toString("base64")}`;
}

/**
 * Verifies a password against a stored scrypt hash in constant time.
 */
export function verifyAdminPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    return false;
  }

  const salt = Buffer.from(parts[1] ?? "", "base64");
  const expected = Buffer.from(parts[2] ?? "", "base64");
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
