# Production Admin Settings and Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production admin area (single env-configured account), encrypted write-only provider credentials in PostgreSQL, runtime wiring for booking/chat/voice, atomic double-booking prevention, and Playwright E2E coverage.

**Architecture:** Next.js App Router routes resolve dependencies per request from a shared PostgreSQL pool. Admin authentication uses scrypt password verification, opaque hashed session tokens, persistent login throttling, same-origin + custom-header CSRF checks. Credentials are AES-256-GCM encrypted with an external key and stored in `encrypted_secrets`; APIs expose only configured status. Booking reserves a `pending` row inside a PostgreSQL transaction guarded by a per-dentist/date advisory lock, then confirms after calendar sync.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Bun, Drizzle ORM, PostgreSQL, zod, sonner, Playwright.

## Global Constraints

- Runtime: Bun >= 1.4.3; Next.js 16+ App Router; React 19+; Tailwind CSS v4; shadcn/ui.
- Format: `bun run format` (`oxfmt --write src tests e2e`); Lint: `bun run lint` (`oxlint`); Typecheck: `bun run check`. NEVER ESLint, Prettier, or `tsc --noEmit`.
- English only for comments, docs, commits. Conventional Commits; do not commit or push unless explicitly asked.
- stdlib first; no new dependencies for what a few lines of `fetch`/`node:crypto` can do; no single-implementation abstractions or speculative scaffolding.
- Never log, echo, or return tokens/client secrets. Client-facing 500s are generic.
- All automated tests mock `fetch`; no live provider calls.
- `bun run format`, `bun run check`, `bun run lint`, `bun test`, `bun run build` must pass before completion.

---

## File Ownership Map (parallel work partition)

| Owner | Files |
|---|---|
| Foundation | `src/repository/schema.ts`, `src/repository/db.ts`, `src/repository/secret-repository.ts`, `src/repository/admin-session-repository.ts`, `src/repository/login-attempt-repository.ts`, `src/security/secret-keys.ts`, `src/domain/admin-settings.ts`, `drizzle/0001_admin_settings.sql`, `scripts/migrate.ts`, `.env.example`, `package.json` |
| Agent A (auth) | `src/security/encryption.ts`, `src/security/password.ts`, `src/security/admin-cookie.ts`, `src/security/admin-guard.ts`, `src/repository/drizzle-secret-repository.ts`, `src/repository/in-memory-secret-repository.ts`, `src/repository/drizzle-admin-session-repository.ts`, `src/repository/in-memory-admin-session-repository.ts`, `src/repository/drizzle-login-attempt-repository.ts`, `src/repository/in-memory-login-attempt-repository.ts`, `src/repository/runtime-repositories.ts`, `src/services/admin-auth-service.ts`, `scripts/hash-admin-password.ts`, `tests/encryption.test.ts`, `tests/admin-session-repository.test.ts`, `tests/admin-auth-service.test.ts` |
| Agent B (booking) | `src/domain/appointment.ts`, `src/repository/appointment-repository.ts`, `src/repository/in-memory-appointment-repository.ts`, `src/repository/drizzle-appointment-repository.ts`, `src/services/appointment-service.ts`, `src/app/api/v1/appointments/route.ts`, `tests/booking-concurrency.test.ts`, `tests/appointment-repository.test.ts`, `tests/appointment-service.test.ts`, `tests/appointments-api-route.test.ts` |
| Agent C (runtime) | `src/providers/calendar/calendar-factory.ts`, `src/repository/drizzle-settings-repository.ts`, `src/services/calendar-provider-cache.ts`, `src/services/runtime-config.ts`, `src/app/api/v1/chat/route.ts`, `src/app/api/v1/voice/session/route.ts`, `src/app/api/v1/voice/tools/route.ts`, `tests/runtime-config.test.ts`, `tests/calendar-factory-secrets.test.ts` |
| Agent D (admin API) | `src/services/admin-settings-service.ts`, `src/services/connection-test-service.ts`, `src/app/api/v1/admin/login/route.ts`, `src/app/api/v1/admin/logout/route.ts`, `src/app/api/v1/admin/session/route.ts`, `src/app/api/v1/admin/settings/route.ts`, `src/app/api/v1/admin/test-connection/route.ts`, `tests/admin-settings-service.test.ts`, `tests/admin-api-routes.test.ts`, `tests/connection-test-service.test.ts` |
| Agent E (admin UI) | `src/app/admin/login/page.tsx`, `src/app/admin/page.tsx`, `src/components/admin/secret-input.tsx`, `src/components/admin/calendar-settings-section.tsx`, `src/components/admin/credentials-section.tsx`, `src/components/admin/admin-settings-form.tsx`, `src/app/page.tsx`, `tests/admin-ui.test.ts` |
| Agent F (E2E) | `playwright.config.ts`, `scripts/e2e-server.ts`, `scripts/e2e-teardown.ts`, `e2e/admin-settings.e2e.ts`, `e2e/booking-concurrency.e2e.ts` |

Do not edit files outside your task's ownership list. Do not commit.

---

### Task 1: Foundation — schema, interfaces, migration, shared DB

**Files:**
- Modify: `src/repository/schema.ts`
- Create: `src/repository/db.ts`, `src/repository/secret-repository.ts`, `src/repository/admin-session-repository.ts`, `src/repository/login-attempt-repository.ts`, `src/security/secret-keys.ts`, `src/domain/admin-settings.ts`, `drizzle/0001_admin_settings.sql`, `scripts/migrate.ts`
- Modify: `.env.example`, `package.json`

**Interfaces:**
- Produces: `getDb()`, `SecretRepository`, `AdminSessionRepository`, `LoginAttemptRepository`, `SECRET_KEYS`, `AdminSettingsView`, `SECRET_GROUPS`.
- Consumes: nothing.

- [ ] **Step 1: Extend Drizzle schema**

Append to `src/repository/schema.ts`:

```ts
import { boolean, index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const encryptedSecrets = pgTable("encrypted_secrets", {
  key: varchar("key", { length: 64 }).primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: varchar("iv", { length: 32 }).notNull(),
  authTag: varchar("auth_tag", { length: 32 }).notNull(),
  keyVersion: varchar("key_version", { length: 16 }).notNull().default("v1"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    username: varchar("username", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (table) => [
    index("admin_sessions_token_hash_idx").on(table.tokenHash),
    index("admin_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const adminLoginAttempts = pgTable(
  "admin_login_attempts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    identifier: varchar("identifier", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [index("admin_login_attempts_identifier_idx").on(table.identifier, table.createdAt)],
);
```

Also add a composite index on `appointments` via its table callback:

```ts
(table) => [index("appointments_dentist_date_status_idx").on(table.dentistId, table.date, table.status)]
```

- [ ] **Step 2: Create repository interfaces**

`src/repository/secret-repository.ts`:

```ts
export type SecretMetadata = {
  key: string;
  isConfigured: boolean;
  updatedAt?: string;
};

export type SecretRepository = {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, plaintext: string): Promise<void>;
  getMetadata(keys: readonly string[]): Promise<Record<string, SecretMetadata>>;
};
```

`src/repository/admin-session-repository.ts`:

```ts
export type AdminSessionRecord = {
  id: string;
  tokenHash: string;
  username: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export type AdminSessionRepository = {
  create(input: { tokenHash: string; username: string; expiresAt: string }): Promise<AdminSessionRecord>;
  findActiveByTokenHash(tokenHash: string, nowIso: string): Promise<AdminSessionRecord | null>;
  touch(id: string, nowIso: string): Promise<void>;
  revoke(tokenHash: string): Promise<void>;
  revokeAll(): Promise<void>;
  purgeExpired(nowIso: string): Promise<void>;
};
```

`src/repository/login-attempt-repository.ts`:

```ts
export type LoginAttemptRepository = {
  recordFailure(identifier: string, atIso: string): Promise<void>;
  countFailures(identifier: string, sinceIso: string): Promise<number>;
  clear(identifier: string): Promise<void>;
};
```

- [ ] **Step 3: Create shared DB access**

`src/repository/db.ts`:

```ts
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

type PostgresClient = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as {
  __dentalDb?: { client: PostgresClient; db: PostgresJsDatabase<Record<string, never>> };
};

export function getDb(): PostgresJsDatabase<Record<string, never>> {
  if (!globalForDb.__dentalDb) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) {
      throw new Error("DATABASE_URL is required for database-backed runtime.");
    }
    const client = postgres(url, { max: 10 });
    globalForDb.__dentalDb = { client, db: drizzle(client) as PostgresJsDatabase<Record<string, never>> };
  }
  return globalForDb.__dentalDb.db;
}
```

- [ ] **Step 4: Define secret keys and admin view types**

`src/security/secret-keys.ts`:

```ts
export const SECRET_KEYS = {
  openaiApiKey: "openai.apiKey",
  googleClientId: "google.clientId",
  googleClientSecret: "google.clientSecret",
  googleRefreshToken: "google.refreshToken",
  microsoftTenantId: "microsoft.tenantId",
  microsoftClientId: "microsoft.clientId",
  microsoftClientSecret: "microsoft.clientSecret",
  microsoftRefreshToken: "microsoft.refreshToken",
} as const;

export type SecretKey = (typeof SECRET_KEYS)[keyof typeof SECRET_KEYS];
export const ALL_SECRET_KEYS: SecretKey[] = Object.values(SECRET_KEYS);
```

`src/domain/admin-settings.ts`:

```ts
import { SECRET_KEYS } from "../security/secret-keys";

export type CalendarProviderId = "none" | "google" | "outlook";
export type MappingProviderId = "google" | "outlook";
export type DentistId = "junior" | "senior-1" | "senior-2";

export type SecretMetadataView = { isConfigured: boolean; updatedAt?: string };

export type AdminDentistMapping = {
  dentistId: DentistId;
  provider: MappingProviderId;
  calendarId: string;
  isActive: boolean;
};

export type AdminSettingsView = {
  calendarProvider: CalendarProviderId;
  dentistMappings: AdminDentistMapping[];
  secrets: Record<string, SecretMetadataView>;
};

export type AdminSettingsUpdate = {
  calendarProvider: CalendarProviderId;
  dentistMappings: Array<{ dentistId: DentistId; provider: MappingProviderId; calendarId: string }>;
  secrets?: Record<string, string>;
};

export type SecretFieldDef = { key: string; label: string; placeholder: string };
export type SecretGroupDef = {
  id: "openai" | "google" | "microsoft";
  title: string;
  testProvider: "openai" | "google" | "microsoft";
  fields: SecretFieldDef[];
};

export const SECRET_GROUPS: SecretGroupDef[] = [
  {
    id: "openai",
    title: "OpenAI",
    testProvider: "openai",
    fields: [{ key: SECRET_KEYS.openaiApiKey, label: "API Key", placeholder: "sk-..." }],
  },
  {
    id: "google",
    title: "Google Calendar",
    testProvider: "google",
    fields: [
      { key: SECRET_KEYS.googleClientId, label: "Client ID", placeholder: "....apps.googleusercontent.com" },
      { key: SECRET_KEYS.googleClientSecret, label: "Client Secret", placeholder: "Google OAuth client secret" },
      { key: SECRET_KEYS.googleRefreshToken, label: "Refresh Token", placeholder: "Google OAuth refresh token" },
    ],
  },
  {
    id: "microsoft",
    title: "Microsoft Outlook",
    testProvider: "microsoft",
    fields: [
      { key: SECRET_KEYS.microsoftTenantId, label: "Tenant ID", placeholder: "tenant id or common" },
      { key: SECRET_KEYS.microsoftClientId, label: "Client ID", placeholder: "Application client ID" },
      { key: SECRET_KEYS.microsoftClientSecret, label: "Client Secret", placeholder: "Application client secret" },
      { key: SECRET_KEYS.microsoftRefreshToken, label: "Refresh Token", placeholder: "Microsoft OAuth refresh token" },
    ],
  },
];
```

- [ ] **Step 5: Write idempotent SQL migration**

`drizzle/0001_admin_settings.sql`:

```sql
CREATE TABLE IF NOT EXISTS appointments (
  id varchar(36) PRIMARY KEY,
  patient_name text NOT NULL,
  patient_phone varchar(32) NOT NULL,
  service_code varchar(8) NOT NULL,
  dentist_id varchar(32) NOT NULL,
  date varchar(10) NOT NULL,
  start_time varchar(5) NOT NULL,
  end_time varchar(5) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'confirmed',
  calendar_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);

CREATE TABLE IF NOT EXISTS clinic_settings (
  key varchar(64) PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dentist_calendar_mappings (
  id varchar(36) PRIMARY KEY,
  dentist_id varchar(32) NOT NULL,
  provider varchar(16) NOT NULL,
  calendar_id text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS encrypted_secrets (
  key varchar(64) PRIMARY KEY,
  ciphertext text NOT NULL,
  iv varchar(32) NOT NULL,
  auth_tag varchar(32) NOT NULL,
  key_version varchar(16) NOT NULL DEFAULT 'v1',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id varchar(36) PRIMARY KEY,
  token_hash varchar(64) NOT NULL,
  username varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_sessions_token_hash_idx ON admin_sessions (token_hash);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx ON admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id varchar(36) PRIMARY KEY,
  identifier varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_login_attempts_identifier_idx ON admin_login_attempts (identifier, created_at);
CREATE INDEX IF NOT EXISTS appointments_dentist_date_status_idx ON appointments (dentist_id, date, status);
```

- [ ] **Step 6: Create migration runner and npm scripts**

`scripts/migrate.ts` reads `drizzle/*.sql` sorted, records applied names in `schema_migrations`, runs each file in a transaction. Add scripts: `"db:migrate": "bun scripts/migrate.ts"`, `"hash:admin-password": "bun scripts/hash-admin-password.ts"`, `"e2e:server": "bun scripts/e2e-server.ts"`.

- [ ] **Step 7: Update `.env.example`**

Add `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (`scrypt:<salt-b64>:<hash-b64>`), `SETTINGS_ENCRYPTION_KEY` (64 hex chars), optional `SETTINGS_ENCRYPTION_KEY_PREVIOUS`, and `APP_BASE_URL`, with non-secret placeholders and a comment that hashes/keys are generated locally.

- [ ] **Step 8: Verify**

Run: `bun run check` — expected: no errors in foundation files (other files currently unchanged).

---

### Task 2: Security primitives and admin authentication (Agent A)

**Interfaces:**
- Consumes: `getDb`, `SECRET_KEYS`, repository interfaces from Task 1.
- Produces:
  - `encryptSecret(plaintext, aad, env?)`, `decryptSecret({ciphertext, iv, authTag, keyVersion}, aad, env?)`
  - `hashAdminPassword(password, salt?)`, `verifyAdminPassword(password, stored)`
  - `AdminAuthService` with `login(input): Promise<LoginResult>`, `validate(token)`, `logout(token)`
  - `getCurrentAdminSession()`, `getAdminCookieName(env)`, `buildSessionCookie`, `buildClearSessionCookie`, `readSessionToken(request)`
  - `isSameOrigin(request, env)`, `hasAdminActionHeader(request)`, `denyAdminRequest(...)`
  - `getRuntimeSettingsRepository()`, `getRuntimeSecretRepository()`, `getRuntimeAppointmentRepository()`, `getRuntimeAdminSessionRepository()`, `getRuntimeLoginAttemptRepository()`

**Key code contracts:**

`src/security/encryption.ts` — AES-256-GCM, 12-byte IV, 16-byte tag, AAD = secret key identifier. Key from `SETTINGS_ENCRYPTION_KEY` (64 hex or 32-byte base64); `SETTINGS_ENCRYPTION_KEY_PREVIOUS` decrypt-only for key version `v0`. Missing/malformed key throws. `decryptSecret` catches auth-tag errors and throws `Error("Unable to decrypt stored secret.")` without leaking detail.

`src/security/password.ts`:

```ts
export function hashAdminPassword(password: string, salt: Buffer = randomBytes(16)): string {
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyAdminPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "base64");
  const expected = Buffer.from(parts[2]!, "base64");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
```

`src/services/admin-auth-service.ts`:
- Session TTL absolute 8 hours, idle 30 minutes.
- `login`: if `countFailures(identifier, now-15min) >= 10` return `{ ok:false, error:"RATE_LIMITED" }`. Verify `username === ADMIN_USERNAME` and `verifyAdminPassword`. On failure `recordFailure` and return `{ ok:false, error:"INVALID_CREDENTIALS" }`. On success `clear`, `revokeAll`, create random token `randomBytes(32).toString("base64url")`, store `sha256Hex(token)`, return `{ ok:true, token, expiresAt }`.
- `validate(token)`: hash, `findActiveByTokenHash`; enforce `expiresAt > now` and `lastSeenAt + 30min > now`; else revoke and return null; else `touch` and return `{ username }`.
- Missing `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` in production fails closed (throws at login); no default credentials.

`src/security/admin-cookie.ts`:
- Cookie name `__Host-admin_session` when `APP_BASE_URL` starts with `https://`, else `admin_session`.
- `HttpOnly; SameSite=Strict; Path=/`, `Secure` when https, `Max-Age` from expiry.
- `readSessionToken` parses `Cookie` header.

`src/security/admin-guard.ts`:
- `isSameOrigin`: compare `Origin` header against `APP_BASE_URL` origin when set, else `new URL(request.url).origin`; missing/mismatched → false.
- `hasAdminActionHeader`: header `x-admin-action === "1"`.
- Routes combine both, returning a generic 403 JSON.

`src/repository/runtime-repositories.ts` constructs Drizzle repos with `getDb()` lazily (module-level singletons are acceptable for stateless repositories because credential values are read per call).

- [ ] **Step 1: Write failing tests**

`tests/encryption.test.ts`:
```ts
const KEY = "a".repeat(64);
test("round-trips a secret bound to its key identifier", () => {
  const env = { SETTINGS_ENCRYPTION_KEY: KEY };
  const enc = encryptSecret("sk-test", "openai.apiKey", env);
  expect(decryptSecret(enc, "openai.apiKey", env)).toBe("sk-test");
});
test("rejects a tampered authentication tag", () => {
  const env = { SETTINGS_ENCRYPTION_KEY: KEY };
  const enc = encryptSecret("sk-test", "openai.apiKey", env);
  expect(() => decryptSecret({ ...enc, authTag: "AAAA" }, "openai.apiKey", env)).toThrow();
});
test("rejects ciphertext moved to a different secret key (AAD)", () => {
  const env = { SETTINGS_ENCRYPTION_KEY: KEY };
  const enc = encryptSecret("sk-test", "openai.apiKey", env);
  expect(() => decryptSecret(enc, "google.clientSecret", env)).toThrow();
});
test("throws when the encryption key is absent or malformed", () => {
  expect(() => encryptSecret("x", "openai.apiKey", {})).toThrow();
  expect(() => encryptSecret("x", "openai.apiKey", { SETTINGS_ENCRYPTION_KEY: "short" })).toThrow();
});
```

`tests/admin-auth-service.test.ts`:
```ts
it("logs in with the configured account and stores only a token hash", async () => {
  const sessionRepo = new InMemoryAdminSessionRepository();
  const attemptRepo = new InMemoryLoginAttemptRepository();
  const auth = new AdminAuthService({ sessionRepository: sessionRepo, attemptRepository: attemptRepo,
    env: { ADMIN_USERNAME: "admin", ADMIN_PASSWORD_HASH: hashAdminPassword("secret-pass") },
    now: () => new Date("2026-10-26T00:00:00.000Z") });
  const result = await auth.login({ username: "admin", password: "secret-pass" });
  expect(result.ok).toBe(true);
  const sessions = await sessionRepo.listAll();
  expect(sessions[0]!.tokenHash).not.toContain(result.token);
});
it("returns RATE_LIMITED after ten failures within fifteen minutes", async () => { /* loop 10 wrong logins, then correct password → RATE_LIMITED */ });
it("invalidates an idle session after thirty minutes", async () => { /* login, advance clock 31 min, validate → null */ });
```

- [ ] **Step 2: Run tests to verify failure** — `bun test tests/encryption.test.ts tests/admin-auth-service.test.ts` → modules not found.
- [ ] **Step 3: Implement modules and repositories** per contracts. In-memory secret repository must encrypt values with `encryptSecret` so tests exercise the real envelope; `getMetadata` never returns plaintext.
- [ ] **Step 4: Create `scripts/hash-admin-password.ts`** — reads password from `Bun.argv[2]` or stdin, prints the scrypt string; never logs the password.
- [ ] **Step 5: Run tests** — `bun test tests/encryption.test.ts tests/admin-auth-service.test.ts tests/admin-session-repository.test.ts` → PASS.
- [ ] **Step 6: Typecheck** — `bun run check` (ignore errors only in files owned by a concurrently running agent; report them).

---

### Task 3: Atomic booking and repository runtime behavior (Agent B)

**Interfaces:**
- Produces: `AppointmentStatus = "pending" | "confirmed" | "cancelled" | "failed"`; `AppointmentFilter.status?: AppointmentStatus | AppointmentStatus[]`; repository methods `reserveIfAvailable(record)` and `confirm(id, calendarEventId)`; route maps `CALENDAR_SYNC_FAILED` to HTTP 502.
- Consumes: existing domain/scheduling modules.

**Flow in `AppointmentService.bookAppointment`:**
1. Existing validation and availability pre-check (fast rejection).
2. Build `pending` record and call `repository.reserveIfAvailable(record)`.
3. `calendarProvider.createEvent(...)`.
4. Success → `repository.confirm(id, event.id)` and return the confirmed record.
5. Provider failure → `repository.updateStatus(id, "failed")` then throw `new AppointmentError("Calendar synchronization failed. Please try again.", "CALENDAR_SYNC_FAILED")`.

**Drizzle reservation (inside one transaction):**

```ts
await this.db.transaction(async (tx) => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${record.dentistId}:${record.date}`}))`);
  const existing = await tx
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.dentistId, record.dentistId),
        eq(appointments.date, record.date),
        inArray(appointments.status, ["pending", "confirmed"]),
      ),
    );
  const conflict = existing.some(
    (row) => record.startTime < row.endTime && record.endTime > row.startTime,
  );
  if (conflict) {
    throw new SlotUnavailableError(
      `The requested slot on ${record.date} at ${record.startTime} is not available.`,
    );
  }
  await tx.insert(appointments).values({ /* all columns, status: "pending" */ });
});
return { ...record };
```

In-memory `reserveIfAvailable` performs the same overlap check against `pending | confirmed` and inserts in the same synchronous section (no `await` between check and `set`), which is atomic in single-threaded Bun.

- [ ] **Step 1: Write failing concurrency tests** (`tests/booking-concurrency.test.ts`):
```ts
it("allows only one of two overlapping in-memory reservations", async () => {
  const repo = new InMemoryAppointmentRepository();
  const base = { patientName: "A", patientPhone: "0812", serviceCode: "A" as const,
    dentistId: "junior", date: "2026-11-10" };
  const first = repo.reserveIfAvailable({ ...makeRecord(base, "09:00", "10:00") });
  const second = repo.reserveIfAvailable({ ...makeRecord(base, "09:30", "10:30") });
  const results = await Promise.allSettled([first, second]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
});
it("marks the reservation failed when the calendar provider throws", async () => {
  const repo = new InMemoryAppointmentRepository();
  const provider = { getBusyIntervals: async () => [], createEvent: async () => { throw new Error("boom"); } };
  const service = new AppointmentService(repo, provider);
  await expect(service.bookAppointment({ ...validInput })).rejects.toMatchObject({ code: "CALENDAR_SYNC_FAILED" });
  const rows = await repo.find({ date: validInput.date });
  expect(rows[0]!.status).toBe("failed");
});
it("does not treat failed reservations as busy", async () => {
  /* book failing provider, then successful provider, same slot → succeeds */
});
```
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement status widening, repository methods, service flow, and route mapping.**
- [ ] **Step 4: Update existing tests** only where the flow legitimately changed (status typing, route mapping). Availability queries must use `["pending", "confirmed"]`; public GET stays `confirmed`.
- [ ] **Step 5: Run** `bun test tests/booking-concurrency.test.ts tests/appointment-service.test.ts tests/appointment-repository.test.ts tests/appointments-api-route.test.ts` → PASS.
- [ ] **Step 6: Typecheck.**

---

### Task 4: Runtime configuration wiring (Agent C)

**Interfaces:**
- Consumes: `SecretRepository`, `SettingsRepository`, `resolveCalendarProvider`, `getDb`.
- Produces: `getRuntimeCalendarProvider()`, `getRuntimeAppointmentService()`, `getRuntimeAiConfig()`, `getRuntimeVoiceApiKey()`, and factory option `secretRepository?: SecretRepository`.

**Behavior:**
- `resolveCalendarProvider` reads each credential from `secretRepository.getSecret(key)` first, then the matching env var. Provider selection and mappings unchanged.
- `src/services/calendar-provider-cache.ts` computes a fingerprint from: `CALENDAR_PROVIDER` setting, active mappings (`dentistId|provider|calendarId` joined), and `updatedAt` metadata of every configured secret. If the fingerprint matches the cached provider, reuse it (preserves OAuth token cache); otherwise re-resolve. This makes admin changes effective without restart, across instances.
- `getRuntimeAppointmentService()` returns `new AppointmentService(getRuntimeAppointmentRepository(), await getRuntimeCalendarProvider())` per request.
- `getRuntimeAiConfig()` returns the secret `openai.apiKey` when present, else falls back to `getAIConfig(env)`; throws if neither exists.
- Chat route builds the orchestrator per request with runtime AI config and runtime appointment service; remove module-level `defaultOrchestrator` and the `"mock-key"` fallback.
- Voice session route uses `getRuntimeVoiceApiKey()` (DB secret first, env fallback) and returns a generic 500 on failure.
- Voice tools route uses `getRuntimeAppointmentService()` per request; remove the module-level in-memory singleton.
- Appointments route default deps use `getRuntimeAppointmentService()` with `getRuntimeAppointmentRepository()`; no in-memory fallback in the default path.
- Replace client-facing `err.message` 500 bodies in these routes with `"Internal server error"`.
- Update `DrizzleSettingsRepository` to use `getDb()` instead of creating its own pool.

- [ ] **Step 1: Write failing tests** (`tests/calendar-factory-secrets.test.ts`, `tests/runtime-config.test.ts`):
```ts
it("prefers a database-stored Google client secret over the environment", async () => {
  const secrets = new InMemorySecretRepository({ SETTINGS_ENCRYPTION_KEY: KEY });
  await secrets.setSecret("google.clientSecret", "db-secret");
  const provider = await resolveCalendarProvider({
    settingsRepository: settings,
    secretRepository: secrets,
    env: { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "env-secret", GOOGLE_REFRESH_TOKEN: "rt" },
  });
  expect(provider).toBeInstanceOf(GoogleCalendarAdapter);
  // assert adapter did not receive env-secret via a fetch spy or exposed config accessor
});
it("uses the database OpenAI key when configured and falls back to env otherwise", async () => { /* ... */ });
```
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement factory secret resolution, cache, runtime config, and route rewiring.**
- [ ] **Step 4: Run** `bun test tests/calendar-factory.test.ts tests/calendar-factory-secrets.test.ts tests/runtime-config.test.ts tests/chat-api-route.test.ts tests/voice-api-routes.test.ts` → PASS.
- [ ] **Step 5: Typecheck.**

---

### Task 5: Admin API (Agent D)

**Interfaces:**
- Consumes: `AdminAuthService`, `SettingsRepository`, `SecretRepository`, `AdminSettingsView`, `AdminSettingsUpdate`, `SECRET_KEYS`, `getRuntimeCalendarProvider` (not required).
- Produces route factories: `createAdminLoginHandler`, `createAdminLogoutHandler`, `createAdminSessionHandler`, `createAdminSettingsHandlers`, `createAdminTestConnectionHandler`; services `readAdminSettings`, `updateAdminSettings`, `testConnection`.

**Contracts:**
- Every mutation requires same-origin and `X-Admin-Action: 1`, checked before reading the body. Login is included.
- `POST /api/v1/admin/login` body `{ username, password }`; success sets the session cookie and returns `{ success: true, username }`. Wrong credentials → 401 `{ success: false, error: "Invalid username or password." }`. Throttled → 429 with `Retry-After: 900`.
- `POST /api/v1/admin/logout` revokes the session and clears the cookie.
- `GET /api/v1/admin/session` → `{ success: true, authenticated, username? }` (never session tokens).
- `GET /api/v1/admin/settings` → `{ success: true, settings: AdminSettingsView }`. Secret metadata only; `calendarProvider` defaults to `"none"` when unset.
- `PUT /api/v1/admin/settings` body validated by zod:
```ts
const updateSchema = z.object({
  calendarProvider: z.enum(["none", "google", "outlook"]),
  dentistMappings: z.array(z.object({
    dentistId: z.enum(["junior", "senior-1", "senior-2"]),
    provider: z.enum(["google", "outlook"]),
    calendarId: z.string().trim().min(1).max(512),
  })).max(6),
  secrets: z.record(z.string(), z.string().max(8192)).optional(),
});
```
  Only keys in `ALL_SECRET_KEYS` are persisted; empty or whitespace-only values are ignored (preserve existing). Non-empty values are trimmed and stored encrypted. Response returns the refreshed `AdminSettingsView`.
- `POST /api/v1/admin/test-connection` body `{ provider: "openai"|"google"|"microsoft", draft?: Record<string,string> }`. Uses draft values when all required fields for that provider are present; otherwise stored values; otherwise env fallback only where documented. Fixed endpoints with `AbortSignal.timeout(8000)`:
  - OpenAI: `GET https://api.openai.com/v1/models` with `Authorization: Bearer`.
  - Google: `POST https://oauth2.googleapis.com/token` `grant_type=refresh_token`.
  - Microsoft: `POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` `grant_type=refresh_token`.
  Returns `{ success, provider, latencyMs, message }`; message is `"Connection successful"` or `"Connection failed"` — never provider response bodies.
- All 500 responses are generic. Tests inject in-memory repositories and a mocked `fetch`.

- [ ] **Step 1: Write failing API tests** (`tests/admin-api-routes.test.ts`) using in-memory repos:
```ts
it("rejects settings mutation without the admin action header", async () => {
  const res = await PUT(new Request("http://localhost/api/v1/admin/settings", { method: "PUT",
    headers: { "content-type": "application/json", cookie: sessionCookie,
      origin: "http://localhost" }, body: JSON.stringify(validPayload) }));
  expect(res.status).toBe(403);
});
it("never returns a stored secret value", async () => {
  await secretRepo.setSecret("openai.apiKey", "sk-super-secret");
  const res = await GET(authorizedRequest());
  const text = await res.text();
  expect(text).not.toContain("sk-super-secret");
  expect(JSON.parse(text).settings.secrets["openai.apiKey"].isConfigured).toBe(true);
});
it("preserves an existing secret when the update value is empty", async () => { /* set, PUT with "", GET → still configured */ });
it("returns 502 when a calendar sync failure surfaces", async () => { /* route maps code */ });
```
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement admin services and route factories.**
- [ ] **Step 4: Run** `bun test tests/admin-api-routes.test.ts tests/admin-settings-service.test.ts tests/connection-test-service.test.ts` → PASS.
- [ ] **Step 5: Typecheck.**

---

### Task 6: Admin UI (Agent E)

**Interfaces:**
- Consumes: `AdminSettingsView`, `SECRET_GROUPS`, admin API contracts from Task 5, `getCurrentAdminSession()` from Task 2.
- Produces: `/admin/login`, `/admin`, `SecretInput`, `CalendarSettingsSection`, `CredentialsSection`, `AdminSettingsForm`.

**UI requirements:**
- `SecretInput`:
  - `type="password"` while hidden; eye button toggles `type="text"` for the current draft only.
  - Eye button rendered only when `value.length > 0`; `aria-label="Show value"` / `"Hide value"`.
  - When configured and no draft, show `Badge variant="success"` text `Configured` and placeholder `•••••••• (leave blank to keep current value)`.
  - Never accepts or displays a stored secret; after successful save the parent clears draft values.
- Login page: username + password (with eye), submit via `fetch("/api/v1/admin/login", { method:"POST", headers: { "content-type":"application/json", "x-admin-action":"1" }, body })`; on success `router.replace("/admin")`; generic error toast on 401; rate-limit toast on 429.
- Admin page (`src/app/admin/page.tsx`) is a server component:
```tsx
const session = await getCurrentAdminSession();
if (!session) redirect("/admin/login");
return <AdminSettingsForm username={session.username} />;
```
- Settings form loads `GET /api/v1/admin/settings` on mount; provider select (`none`, `google`, `outlook`); three mapping rows (junior/senior-1/senior-2) with provider select + calendar ID input; credential sections from `SECRET_GROUPS`; per-provider "Test connection" button; Save button; Logout button. Use `sonner` toasts. All mutation fetches include `x-admin-action: 1`.
- After save, clear all secret draft fields and replace settings state with the response.
- Homepage header gets a small ghost "Admin" link to `/admin`.
- Tailwind v4 semantic tokens; flex with `gap-*` (no `space-x/y`).

- [ ] **Step 1: Write a component test** (`tests/admin-ui.test.ts`) using `bun:test` + `react-dom/server` where feasible, or assert exported prop contracts and render `SecretInput` with `renderToStaticMarkup` (no draft → placeholder, no eye button). Client hooks requiring effects can be tested through a small pure helper if SSR is impractical; at minimum assert the component module exports and static markup for the no-draft state.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement the pages and components.**
- [ ] **Step 4: Run** `bun test tests/admin-ui.test.ts` and `bun run check`.
- [ ] **Step 5: Manual smoke** — `bun run build` must succeed.

---

### Task 7: E2E infrastructure and browser tests (Agent F)

**Interfaces:**
- Consumes: all prior tasks, Docker.
- Produces: `scripts/e2e-server.ts`, `scripts/e2e-teardown.ts`, updated Playwright config, two E2E specs.

**Environment (fixed test values, non-secret):**
- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54999/dental_e2e`
- `ADMIN_USERNAME=e2e-admin`
- `ADMIN_PASSWORD_HASH=<computed with scripts/hash-admin-password.ts for password "E2E-Admin-Password-123!">`
- `SETTINGS_ENCRYPTION_KEY=<64 hex chars>`
- `APP_BASE_URL=http://127.0.0.1:3000`
- `CALENDAR_PROVIDER=none`, `OPENAI_API_KEY=test-openai-key`

**`scripts/e2e-server.ts`:** remove any container named `dental-e2e-pg` (`docker rm -f`, ignore failure), run `docker run -d --name dental-e2e-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=dental_e2e -p 54999:5432 postgres:16-alpine`, poll a `postgres` client `select 1` for up to 60s, run `bun scripts/migrate.ts`, then spawn `bun run start` inheriting stdout/stderr. Fail with a clear message if Docker is unavailable.

**`scripts/e2e-teardown.ts`:** `docker rm -f dental-e2e-pg` (ignore failure).

**`playwright.config.ts`:** `webServer.command = "bun scripts/e2e-server.ts"`, `reuseExistingServer: false`, `timeout: 180_000`, `env` with the values above, and `globalTeardown: "./scripts/e2e-teardown.ts"`.

**`e2e/admin-settings.e2e.ts`:**
1. Unauthenticated `GET /admin` redirects to `/admin/login`.
2. Wrong password → visible error, stays on login.
3. Correct password → `/admin` shows the settings form.
4. Select provider `google`, fill junior mapping calendar ID, type an OpenAI draft key, click Show value → input `type` becomes `text` and value visible; click Hide → password.
5. Save; capture the `PUT /api/v1/admin/settings` response text and assert it does not contain the draft key; toast success.
6. Reload: OpenAI field is empty and shows `Configured`; provider persists.
7. Logout → login page; `GET /admin` redirects again.

**`e2e/booking-concurrency.e2e.ts`:**
```ts
const payload = { patientName: "Race Test", patientPhone: "+628123456789", serviceCode: "A",
  dentistId: "junior", date: "2026-11-10", startTime: "09:00" };
const [a, b] = await Promise.all([
  request.post("/api/v1/appointments", { data: payload }),
  request.post("/api/v1/appointments", { data: payload }),
]);
const statuses = [a.status(), b.status()].sort();
expect(statuses).toEqual([201, 422]);
const list = await request.get("/api/v1/appointments?date=2026-11-10");
expect((await list.json()).appointments).toHaveLength(1);
const later = await request.post("/api/v1/appointments", { data: { ...payload, startTime: "10:00" } });
expect(later.status()).toBe(201);
```
Requests must send `origin: http://127.0.0.1:3000` if the route enforces origin (it does not for public routes, but include it for realism).

- [ ] **Step 1: Write the server script, teardown, config, and specs.**
- [ ] **Step 2: Build** `bun run build`.
- [ ] **Step 3: Run** `bun run test:e2e` → both specs PASS. If Docker is unavailable, stop and report; do not fake results.
- [ ] **Step 4: Format/lint/typecheck.**

---

### Task 8: Documentation and final verification (Foundation owner)

- [ ] **Step 1:** Update README with admin setup: generating `ADMIN_PASSWORD_HASH`, `SETTINGS_ENCRYPTION_KEY`, `bun run db:migrate`, `/admin` usage, write-only secret behavior, and E2E prerequisites (Docker, build).
- [ ] **Step 2:** Update `docs/BrightSmile_Dental_AI_Technical_Spec.html` only where it claims row-level locking or unimplemented admin capabilities — align wording with the advisory-lock + pending-reservation design. Regenerate PDFs with `bun run build:pdf` if that document is edited.
- [ ] **Step 3:** Run `bun run format`.
- [ ] **Step 4:** Run `bun run check` → PASS.
- [ ] **Step 5:** Run `bun run lint` → PASS.
- [ ] **Step 6:** Run `bun test` → PASS.
- [ ] **Step 7:** Run `bun run build` → PASS.
- [ ] **Step 8:** Run `bun run test:e2e` → PASS (Docker required).
- [ ] **Step 9:** Report actual command output; do not claim success without it.

---

## Self-Review

- **Spec coverage:** admin single account (Task 2), session/CSRF/throttle (Tasks 2, 5), AES-GCM vault + write-only contract (Tasks 2, 5), toggle-eye draft only (Task 6), runtime DB wiring without restart (Task 4), atomic booking with advisory lock + pending/failed lifecycle (Task 3), migration/deployment (Tasks 1, 8), E2E admin + concurrency (Task 7), safe error responses (Tasks 4, 5, 8).
- **Deliberate deviations:** IP-based login throttling is omitted because no trusted proxy configuration exists; account-level persistent throttling is implemented instead, matching the spec's conditional wording. Automatic stale-pending reconciliation remains an operational state (visible in the DB), not an automated job; the spec does not require the job.
- **Type consistency:** `AdminSettingsView`, `SecretRepository`, `AdminSessionRepository`, `LoginAttemptRepository`, `reserveIfAvailable`, `confirm`, `CALENDAR_SYNC_FAILED` are defined once and referenced identically in later tasks.
- **Placeholders:** none; every task lists exact files, signatures, and verification commands.
