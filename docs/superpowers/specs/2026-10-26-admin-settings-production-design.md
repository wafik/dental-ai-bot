# Production Admin Settings and Booking Design

**Date:** 2026-10-26  
**Status:** Approved direction; implementation follows this specification.

## Goal

Provide a production-capable admin area for managing calendar provider selection, dentist calendar mappings, and AI/calendar credentials, and make those settings drive real appointment, chat, and voice requests. Prevent two application requests from booking overlapping appointments for the same dentist. Include browser end-to-end coverage for the admin workflow and booking race.

## Current state verified

- There is no admin page or admin API.
- `SettingsRepository` persists provider settings and calendar mappings, but provider OAuth credentials and OpenAI credentials are read from the environment.
- Appointment, chat, and voice-tools API defaults use in-memory appointment repositories.
- Appointment booking checks availability before writing the appointment, so concurrent requests can both see the same slot as free.
- The schema defines appointments, clinic settings, and calendar mappings; no encrypted-secret or admin-session tables exist.
- No migration directory was found during exploration. Implementation must add a repeatable schema deployment path before production routes depend on new tables.

## Scope and non-goals

### In scope

1. A single environment-configured admin account; no SSO or admin-user table.
2. Secure login/session, protected settings APIs and pages, CSRF defenses, and persistent login throttling.
3. Admin UI for active provider (`none`, `google`, `outlook`), dentist calendar mappings (`junior`, `senior-1`, `senior-2`), and OpenAI/Google/Microsoft credentials.
4. AES-256-GCM encrypted credentials stored in a dedicated PostgreSQL table; encryption key stays in deployment secrets.
5. Write-only secret API contract. The eye toggle reveals only unsaved input currently typed in the browser.
6. Production PostgreSQL runtime wiring for appointment, chat, and voice booking paths, with no silent in-memory fallback in production.
7. Atomic database reservation preventing overlapping application bookings for one dentist/date, including concurrent app instances.
8. Playwright E2E tests covering admin login/settings/secret behavior and a concurrent double-booking attempt.
9. Unit/API tests for crypto, authentication, repository operations, settings validation, and booking reservation behavior.

### Out of scope

- SSO, multiple admin accounts, role management, and cloud-specific KMS integration.
- Automated live provider calls in test suites.
- Guaranteeing a global transaction across PostgreSQL and external calendar services. Calendar services are separate systems and may be independently modified.
- Claims of database row-level locking unless implemented and tested; the concurrency mechanism below is a PostgreSQL transaction-scoped advisory lock plus overlap check and reservation insert.

## Architecture

### Admin identity and sessions

- Read `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` from the server environment. Store only a salted scrypt password hash, never a plaintext admin password. Session tokens are 256-bit CSPRNG values, so no extra signing secret is required.
- Issue a cryptographically random opaque session token after successful login; persist only its SHA-256 hash in `admin_sessions`. Enforce idle and absolute expiry. A new login revokes any existing session for the single configured admin; logout deletes its row.
- Use an `HttpOnly`, `SameSite=Strict`, `Path=/` cookie with `Secure` in production. Reject state-changing admin requests unless the Origin matches the configured application origin and the request includes the expected custom admin-action header. Do not enable permissive CORS.
- Apply persistent account-level login throttling in PostgreSQL; only use client IP for an additional limit when it is derived from explicitly trusted proxy configuration. Never trust arbitrary `X-Forwarded-For` input.
- Fail closed when required production admin/session or encryption configuration is missing or invalid. Do not put secrets in logs or client error responses.

### Secret persistence and API contract

- Add `encrypted_secrets` with a key identifier, Base64 ciphertext, 12-byte random IV, 16-byte GCM authentication tag, key version, and updated timestamp.
- Encrypt each value using Node's `node:crypto` AES-256-GCM. Bind the secret key identifier as AAD. Require a 32-byte key from `SETTINGS_ENCRYPTION_KEY`; do not use a default key. Malformed keys, invalid tags, or unknown key versions fail closed.
- Admin settings reads return only `isConfigured` and `updatedAt` for each credential; never plaintext or ciphertext. Empty/omitted secret fields on update preserve the stored value. A non-empty field replaces it.
- The UI's secret inputs begin empty even when configured. They show configured status and a write-only placeholder. An accessible eye button is available only while a new draft value is present, and the form clears draft values after successful save.
- Calendar mappings and active provider are non-secret settings. Validate the provider enum, exact dentist IDs, mapping provider, and non-empty bounded calendar IDs before persistence.
- Allow saving credentials before they are verified, but clearly distinguish configured from tested. A deliberate “Test connection” action can validate a draft or saved credential against a fixed provider endpoint with a timeout; it must not accept arbitrary URLs and must not persist a draft by itself. Automated tests mock `fetch` only.

### Production runtime configuration

- Add one shared PostgreSQL connection pool and repositories for appointments, settings, encrypted secrets, and admin sessions. Use the same DB connection configuration consistently; require a real configured database in production.
- Route handlers resolve dependencies per request (or resolve fresh settings per request), so admin changes do not require a process restart. Do not cache credential-bearing provider adapters across requests unless a versioned cache invalidation mechanism is implemented and tested.
- Database-stored credentials take precedence when configured. Environment credentials may remain a documented bootstrap fallback during migration; settings UI reports source/configured state without exposing values. Provider `none` explicitly disables external calendar integration.
- Chat and voice routes resolve the current OpenAI credential from the secure settings service before constructing the provider. Appointment routes resolve active calendar configuration and mappings from PostgreSQL.
- Production route failures return generic client-safe errors with a correlation identifier; detailed errors must not contain tokens, request bodies, or database credentials.

### Atomic booking and calendar consistency

1. Validate service eligibility, date/time formats, duration, and working hours as today.
2. Create a candidate appointment with a unique ID and `pending` status.
3. In one PostgreSQL transaction, acquire `pg_advisory_xact_lock` for the dentist/date key, query active (`pending` or `confirmed`) appointments for interval overlap, and insert the pending reservation only if no overlap exists. This serializes competing reservations for that dentist/date across app instances. Keep this operation behind the appointment repository so in-memory unit tests can provide a deterministic implementation.
4. After reservation commit, create the external calendar event. On success, persist the event ID and mark the appointment `confirmed`. On a handled provider failure, mark the reservation `failed` so it no longer blocks availability and return a safe error.
5. Availability queries treat `pending` and `confirmed` appointments as busy; public appointment lists expose only confirmed records. Tests verify the lock/reservation behavior against PostgreSQL where available, not only a mocked repository.
6. Because PostgreSQL and calendar APIs cannot share a transaction, a process crash between reservation and final status can leave a pending record. Preserve it as busy rather than accidentally double-booking. Include an operationally visible stale-pending state for reconciliation; do not claim automatic exactly-once external synchronization. Provider idempotency/reconciliation can be added when the provider contract supports it.

### Migration and deployment

- Add versioned Drizzle SQL migration(s) for the new session, login-throttle, encrypted-secret tables and appointment status/index changes, plus a documented migration command. Do not rely on implicit table creation at runtime.
- Update `.env.example` and deployment documentation with required environment variable names, formats, key generation/rotation caveat, and first-admin setup. Never add real keys.
- Production startup/readiness must fail clearly if required database or security configuration is absent; local/injected test dependencies remain available without weakening production behavior.

## UI and routes

- `/admin/login`: accessible sign-in form with password visibility control if applicable and generic credential errors.
- `/admin`: protected settings UI with provider/mappings, AI/calendar credential sections, status, explicit connection tests, save feedback, and logout.
- Admin API: login, logout, session status, settings read/update, and connection-test endpoints. All mutation endpoints share authentication and CSRF checks. Never expose secret retrieval through an admin route.
- The main application may link to the admin page, but must not expose admin controls or settings to unauthenticated users.

## Verification and E2E acceptance

- Unit tests verify AES-GCM round trips, AAD/tag tampering rejection, invalid key handling, secret metadata/write-only contract, hash/session checks, and mapping/provider validation.
- Route tests assert unauthenticated and cross-origin mutations are rejected, secrets never appear in responses, omitted secrets are preserved, and DB/provider failures return safe errors.
- E2E uses an isolated PostgreSQL database and non-production test credentials; calendar integration is `none` or mocked. It covers:
  1. Unauthenticated admin redirect/access denial.
  2. Login, save provider/mapping and a test credential, and observe configured status.
  3. Eye toggle reveals the typed draft, then hides it; after save, reload confirms the field is empty/write-only and the API response contains no credential value.
  4. Logout invalidates access.
  5. Two concurrent requests for overlapping same-dentist slots yield one successful booking and one unavailable response; a non-overlapping booking remains possible.
- Run project checks: `bun run format`, `bun run check`, `bun run lint`, `bun test`, `bun run build`, and `bun run test:e2e` where the isolated PostgreSQL service is available. Never make live provider requests from automated tests.

## Acceptance criteria

- Admin can securely update provider, mappings, and third-party credentials without restarting the server.
- No admin API or UI response can reveal a stored secret, and the eye toggle only applies to the unsaved draft.
- Production booking/chat/voice routes do not silently use in-memory repositories.
- Competing application booking requests cannot both reserve overlapping same-dentist time ranges.
- Calendar sync failures do not leave a reservation appearing confirmed; interrupted pending reservations remain visible for reconciliation.
- E2E tests exercise the real browser UI and PostgreSQL-backed booking route using an isolated test database.
