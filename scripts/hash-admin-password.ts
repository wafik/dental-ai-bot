import { hashAdminPassword } from "../src/security/password";

/**
 * Generates a scrypt password hash for ADMIN_PASSWORD_HASH.
 * Usage: bun scripts/hash-admin-password.ts "your password"
 * The password is never printed.
 */
const password = Bun.argv[2];
if (!password) {
  console.error('Usage: bun scripts/hash-admin-password.ts "your password"');
  process.exit(1);
}

console.log(hashAdminPassword(password));
