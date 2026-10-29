// Imports a Google service-account key JSON into the encrypted secret store.
// Manual one-off: automated tests never touch the network or a real key.
// Usage: bun scripts/import-google-service-account.ts <service-account.json>
// Never prints the private key; only the account email and stored key names.
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DrizzleSecretRepository } from "../src/repository/drizzle-secret-repository";
import { SECRET_KEYS } from "../src/security/secret-keys";

const KEY_PATH = process.argv[2];
if (!KEY_PATH) {
  console.error("usage: bun scripts/import-google-service-account.ts <service-account.json>");
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const creds = JSON.parse(readFileSync(KEY_PATH, "utf8")) as {
  client_email?: string;
  private_key?: string;
};

if (!creds.client_email || !creds.private_key) {
  console.error("Key file is missing client_email or private_key.");
  process.exit(1);
}

// Own short-lived pool so the script exits instead of holding the shared one.
const sql = postgres(url, { max: 1 });
const repository = new DrizzleSecretRepository(drizzle(sql));

try {
  await repository.setSecret(SECRET_KEYS.googleServiceAccountEmail, creds.client_email);
  await repository.setSecret(SECRET_KEYS.googleServiceAccountPrivateKey, creds.private_key);

  console.log(`[import] stored ${SECRET_KEYS.googleServiceAccountEmail} = ${creds.client_email}`);
  console.log(`[import] stored ${SECRET_KEYS.googleServiceAccountPrivateKey} (value hidden)`);

  // Prove the round trip decrypts before declaring success.
  const email = await repository.getSecret(SECRET_KEYS.googleServiceAccountEmail);
  const key = await repository.getSecret(SECRET_KEYS.googleServiceAccountPrivateKey);
  console.log(`[verify] email matches: ${email === creds.client_email}`);
  console.log(`[verify] key matches: ${key === creds.private_key}`);
} finally {
  await sql.end({ timeout: 1 });
}
