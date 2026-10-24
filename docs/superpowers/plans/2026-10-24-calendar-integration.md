# Calendar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-neutral calendar free/busy and event-creation operations backed by Google Calendar and Microsoft Graph REST adapters, verified with mocked HTTP requests.

**Architecture:** Keep the shared contract and adapters in `src/providers/calendar/`, with environment parsing in `src/config/`. Each adapter uses built-in `fetch`, obtains delegated access tokens from configured refresh tokens, normalizes provider responses into shared UTC timestamps, and never requires real network access in tests. Cloud resource creation, OAuth consent/login, live integration tests, persistence, and booking workflows are outside this implementation.

**Tech Stack:** TypeScript, Bun >= 1.4.3 and built-in test runner, Next.js App Router project, native `fetch`, Google Calendar API v3, Microsoft Graph REST API.

## Global Constraints

- Use one repository for the frontend and backend; keep the API delivery layer, domain logic, integrations, tests, and documentation in this repository.
- Use `bun check`, `oxlint`, and `oxfmt`; never use ESLint or `tsc --noEmit`.
- Keep HTTP handling thin and put business rules in domain/services modules.
- Define one `CalendarProvider` contract for the operations required by scheduling.
- Implement `GoogleCalendarAdapter` and `OutlookCalendarAdapter` for Google Calendar API v3 and Microsoft Graph Calendar.
- Keep provider-specific calendar IDs and credentials in configuration, not in appointment business rules.
- Do not scaffold unused integrations.
- All code comments, docstrings, inline notes, and repository documentation must be written in English.
- Do not create cloud resources or perform live external writes during this implementation; use mocked HTTP tests.
- Preserve unrelated existing working-tree changes; do not stage or modify `.claude-flow/` or `.claude/` hook state.
- Do not create commits or push changes unless the user asks.
- If adding or changing a Next.js API route, first read the relevant local guide in `dist/docs/`; this plan does not add API routes.

---

## Task 1: Shared calendar contract and errors

**Files:**
- Create: `src/providers/calendar/calendar-provider.ts`
- Create: `src/providers/calendar/calendar-error.ts`
- Test: `tests/calendar-provider.test.ts`

**Interfaces:**
```ts
export type BusyInterval = { start: string; end: string };

export type CalendarEventInput = {
  dentistId: string;
  summary: string;
  description: string;
  start: string;
  end: string;
};

export type CreatedCalendarEvent = {
  id: string;
  start: string;
  end: string;
};

export type CalendarProviderName = "google" | "outlook";
export type CalendarOperation = "getBusyIntervals" | "createEvent" | "refreshToken";

export type CalendarProviderErrorOptions = {
  message: string;
  provider: CalendarProviderName;
  operation: CalendarOperation;
  status?: number;
  cause?: unknown;
};

export class CalendarProviderError extends Error {
  readonly provider: CalendarProviderName;
  readonly operation: CalendarOperation;
  readonly status?: number;

  constructor(options: CalendarProviderErrorOptions);
}

export type CalendarProvider = {
  getBusyIntervals(input: {
    dentistId: string;
    start: string;
    end: string;
  }): Promise<BusyInterval[]>;
  createEvent(input: CalendarEventInput): Promise<CreatedCalendarEvent>;
};

export function normalizeCalendarInterval(start: string, end: string): BusyInterval;
```

`normalizeCalendarInterval` accepts only RFC3339 timestamps with an explicit `Z` or numeric UTC offset, rejects invalid calendar dates/times, requires `start < end`, and returns canonical UTC ISO strings with `Z`. `CalendarProviderError` exposes `provider`, `operation`, and optional HTTP `status`; it must not retain tokens or provider response bodies.

- [x] **Step 1: Write failing tests** in `tests/calendar-provider.test.ts` for `CalendarProviderError` metadata, error inheritance, and `normalizeCalendarInterval`: valid Z timestamps, valid numeric-offset timestamps, invalid dates, missing offset, and start not before end. Use a tiny fake provider implementing `CalendarProvider` to prove both method signatures are usable.
- [x] **Step 2: Run `bun test tests/calendar-provider.test.ts`**; confirm it fails because the shared exports/validation are absent, not because of a test syntax error.
- [x] **Step 3: Implement the types, error class, and `normalizeCalendarInterval`** in `src/providers/calendar/calendar-error.ts` and `src/providers/calendar/calendar-provider.ts`.
- [x] **Step 4: Run `bun test tests/calendar-provider.test.ts`** and confirm all tests pass.
- [x] **Step 5: Run `bun check`** to ensure clean typechecking.

## Task 2: Environment configuration

**Files:**
- Create: `src/config/calendar.ts`
- Create or modify: `.env.example`
- Test: `tests/calendar-config.test.ts`

**Interfaces:**
- `getGoogleCalendarConfig(env)` returns `{ clientId, clientSecret, refreshToken, calendarIds }`.
- `getOutlookCalendarConfig(env)` returns `{ tenantId, clientId, clientSecret, refreshToken, calendarIds }`.
- `env` is a read-only string map; default it to `process.env`. Do not validate either provider until its getter is called.
- Calendar map keys are exactly `junior`, `senior-1`, `senior-2`, matching `src/domain/clinic.ts`.

Environment variable names:
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_JUNIOR`, `GOOGLE_CALENDAR_SENIOR_1`, `GOOGLE_CALENDAR_SENIOR_2`.
- Microsoft: `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REFRESH_TOKEN`, `MICROSOFT_CALENDAR_JUNIOR`, `MICROSOFT_CALENDAR_SENIOR_1`, `MICROSOFT_CALENDAR_SENIOR_2`.

- [x] **Step 1: Write failing tests** for complete provider configs, distinct dentist mappings, independent provider parsing, and missing-key diagnostics that never echo secret values.
- [x] **Step 2: Run `bun test tests/calendar-config.test.ts`** and confirm it fails because the getters are not implemented.
- [x] **Step 3: Implement both getters** and add placeholder-only values to `.env.example`. Do not add OAuth routes, token persistence, or real identifiers.
- [x] **Step 4: Run `bun test tests/calendar-config.test.ts`** and confirm it passes.
- [x] **Step 5: Run `bun check`** for this task's new code.

## Task 3: Google Calendar REST adapter

**Files:**
- Create: `src/providers/calendar/google-calendar-adapter.ts`
- Test: `tests/google-calendar-adapter.test.ts`

**Interfaces:**
- `GoogleCalendarAdapter` implements `CalendarProvider` and accepts config plus an optional injected `fetch` function (default `globalThis.fetch`).
- Resolve `dentistId` through `calendarIds`; missing mappings fail with `CalendarProviderError` before making an HTTP request.
- Refresh endpoint: `POST https://oauth2.googleapis.com/token`, form fields `grant_type=refresh_token`, `client_id`, `client_secret`, and `refresh_token`. Cache the access token in adapter memory until shortly before `expires_in`; refresh when missing or expired, and do not persist the access token.
- Free/busy endpoint: `POST https://www.googleapis.com/calendar/v3/freeBusy` with JSON payload `{ timeMin: start, timeMax: end, items: [{ id: calendarId }] }`. Parse `res.calendars[calendarId]`: if the calendar key is missing or if `calendars[calendarId].errors` exists and is non-empty, throw `CalendarProviderError`. Otherwise, map `calendars[calendarId].busy` intervals through `normalizeCalendarInterval`.
- Event creation endpoint: `POST https://www.googleapis.com/calendar/v3/calendars/{encodeURIComponent(calendarId)}/events`; send timed UTC `start.dateTime` and `end.dateTime` fields with explicit `summary` and `description`.
- Request the minimum Google scopes required by free/busy and event creation; document the exact scope URIs in `docs/CALENDAR_SETUP.md` and test the expected scope configuration.

- [x] **Step 1: Write failing mocked-fetch tests** for access-token exchange, correct Freebusy request payload, in-body errors in Freebusy response, normalized busy intervals, event insertion/ID result, URL encoding, missing mapping, malformed provider response, and token/API errors.
- [x] **Step 2: Run `bun test tests/google-calendar-adapter.test.ts`** and verify expected failures are due to absent adapter behavior.
- [x] **Step 3: Implement the adapter** using built-in `fetch`; check `response.ok`, avoid logging/storing response bodies on errors, and normalize all returned timestamps to UTC.
- [x] **Step 4: Run `bun test tests/google-calendar-adapter.test.ts`** and confirm it passes.
- [x] **Step 5: Run `bun check`** for this task's new code.

## Task 4: Microsoft Graph REST adapter and shared contract verification

**Files:**
- Create: `src/providers/calendar/outlook-calendar-adapter.ts`
- Test: `tests/outlook-calendar-adapter.test.ts`
- Test: `tests/calendar-contract.test.ts`

**Interfaces:**
- `OutlookCalendarAdapter` implements `CalendarProvider` and accepts config plus an optional injected `fetch` function (default `globalThis.fetch`).
- Resolve `dentistId` through `calendarIds`; missing mappings fail with `CalendarProviderError` before making an HTTP request.
- Token endpoint: `POST https://login.microsoftonline.com/{encodeURIComponent(tenantId)}/oauth2/v2.0/token`, with form fields `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`, and `scope=https://graph.microsoft.com/Calendars.ReadWrite` (do NOT include `offline_access` in refresh request). Cache the access token in adapter memory until shortly before `expires_in`; refresh when missing or expired, and do not persist the access token.
- Read busy events from `GET https://graph.microsoft.com/v1.0/me/calendars/{encodeURIComponent(calendarId)}/calendarView` with UTC `startDateTime` and `endDateTime` query parameters and header `Prefer: outlook.timezone="UTC"`. Follow `@odata.nextLink` until all pages are read, passing the Authorization header on all page requests.
- Handle Graph's `dateTimeTimeZone` objects (`{ dateTime: string, timeZone: string }`), verifying `timeZone === "UTC"` and converting to canonical UTC ISO string before passing to `normalizeCalendarInterval`. Exclude cancelled events and events with `showAs: "free"`; reject malformed responses instead of treating them as an empty schedule.
- Create timed events at `POST https://graph.microsoft.com/v1.0/me/calendars/{encodeURIComponent(calendarId)}/events` with JSON payload `{ subject: input.summary, body: { contentType: "Text", content: input.description }, start: { dateTime: normalizedStart, timeZone: "UTC" }, end: { dateTime: normalizedEnd, timeZone: "UTC" } }`.

- [x] **Step 1: Write failing mocked-fetch tests** in `tests/outlook-calendar-adapter.test.ts` for refresh-token exchange (without `offline_access`), calendarView URL/query/header, `@odata.nextLink` pagination across multiple pages, free/cancelled/busy event filtering, floating Graph timestamp parsing, event creation mapping (`subject` and `body`), URL encoding, missing mapping, and error handling.
- [x] **Step 2: Run `bun test tests/outlook-calendar-adapter.test.ts`** and verify expected failures.
- [x] **Step 3: Implement the adapter** using built-in `fetch`; check HTTP errors without including provider response bodies or credentials in thrown errors.
- [x] **Step 4: Run `bun test tests/outlook-calendar-adapter.test.ts`** and confirm it passes.
- [x] **Step 5: Write contract compliance test** in `tests/calendar-contract.test.ts` asserting equivalent output shapes across both `GoogleCalendarAdapter` and `OutlookCalendarAdapter`.
- [x] **Step 6: Run `bun test tests/calendar-contract.test.ts`** and confirm it passes.
- [x] **Step 7: Run `bun check`** for this task's new code.

## Task 5: Setup documentation and Day 2 tracking

**Files:**
- Create: `docs/CALENDAR_SETUP.md`
- Modify: `README.md`
- Modify: `docs/PLAN.md`

- [x] **Step 1: Document external setup steps** for Google OAuth offline access (with 3 Google calendars) and Microsoft Entra delegated `Calendars.ReadWrite`/`offline_access` consent (with 3 mapped calendars under `/me/calendars/{id}`). Explain that all 3 dentist calendars in Microsoft 365 must exist within or be shared with write access into the authenticated user account. List required environment variable names with placeholders.
- [x] **Step 2: Document OAuth scopes and token lifecycles** for Google and Microsoft. Explicitly clarify that Entra token refresh calls request resource scope only (excluding `offline_access`), and that operators must update the configured refresh token if rotated.
- [x] **Step 3: Document operational boundaries**: no in-app OAuth UI, no token persistence, no cancellation/update, no live cloud tests in this phase.
- [x] **Step 4: Update Day 2 checklist** in `docs/PLAN.md` to distinguish completed adapter and mock-test implementations from outstanding live cloud setup and end-to-end tests.
- [x] **Step 5: Ensure all documentation, notes, and code comments are written in English.**

## Task 6: Full verification and review

- [x] **Step 1: Run `bun run format`.**
- [x] **Step 2: Run `bun check`.**
- [x] **Step 3: Run `bun run lint`.**
- [x] **Step 4: Run `bun test`.**
- [x] **Step 5: Run `bun run build`.**
- [x] **Step 6: Run `bun install --frozen-lockfile --lockfile-only`.**
- [x] **Step 7: Inspect working tree diff and status** to verify no secrets or extraneous files are present.

## API references

- Google Freebusy query: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- Google Events insert: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Google Calendar authorization scopes: https://developers.google.com/workspace/calendar/api/auth
- Google OAuth offline access: https://developers.google.com/identity/protocols/oauth2/web-server#offline
- Microsoft Graph calendarView: https://learn.microsoft.com/en-us/graph/api/user-list-calendarview
- Microsoft Graph create event: https://learn.microsoft.com/en-us/graph/api/user-post-events
- Microsoft Graph event resource: https://learn.microsoft.com/en-us/graph/api/resources/event
- Microsoft Graph dateTimeTimeZone: https://learn.microsoft.com/en-us/graph/api/resources/datetimetimezone
- Microsoft identity platform authorization code and refresh-token flow: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
