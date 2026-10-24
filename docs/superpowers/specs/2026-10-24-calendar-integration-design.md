# Calendar Integration Design

**Status:** Approved for implementation  
**Date:** October 24, 2026

## Goal

Provide a provider-neutral calendar integration for checking appointment availability and creating events in Google Calendar and Microsoft Outlook, without requiring cloud accounts for automated tests.

All code comments, docstrings, inline notes, and repository documentation for this work are written in English.

## Scope

Included in this phase:
- A shared `CalendarProvider` contract with free/busy lookup and event creation.
- Google Calendar API v3 and Microsoft Graph REST adapters.
- Delegated OAuth access tokens obtained by exchanging refresh tokens supplied through environment configuration.
- Per-dentist calendar ID mapping in provider configuration.
- Deterministic mocked-fetch tests for token exchange, provider requests, response normalization, event creation, and errors.
- Setup documentation for creating required cloud credentials and calendars, plus an explicit note that live provider tests remain outstanding until credentials are available.

Not included:
- Creating Google Cloud or Microsoft Entra resources, registering applications, or provisioning calendars.
- An in-app OAuth consent/callback flow or token persistence/rotation.
- Booking persistence, cancellation/update operations, webhook synchronization, retries, or concurrent-booking guarantees.
- Live requests to either provider during implementation or automated tests.

## Architecture

Keep the integration in the existing single repository. Place the shared contract and provider adapters under `src/providers/calendar/`, and environment configuration under `src/config/`. Do not place provider credentials or calendar IDs in appointment-domain rules.

The contract exposes two operations:
1. `getBusyIntervals` accepts a dentist/calendar mapping and an RFC3339 start/end window, and returns provider-neutral busy intervals.
2. `createEvent` accepts the mapped calendar and event details (`summary`, `description`, `start`, `end`) and returns the provider event ID and canonical timestamps.

Adapters use the built-in `fetch` API and accept a fetch implementation for tests. Google exchanges a configured refresh token at Google's OAuth token endpoint, queries Freebusy, and inserts an event. Microsoft exchanges a configured refresh token at the tenant's OAuth v2 token endpoint, reads the mapped calendar's `calendarView` over the requested interval in UTC, and creates an event in that calendar. Both normalize timestamps to RFC3339 UTC and map provider HTTP failures to a typed error containing provider identity and HTTP status without embedding tokens or response bodies.

## Configuration and safety

Provider settings are read from environment variables at call time so importing the application does not require secrets. The settings include OAuth client details and refresh token per provider, plus calendar IDs mapped by dentist. `.env.example` uses placeholders only. Setup instructions will request delegated calendar access, including Microsoft Graph `Calendars.ReadWrite`; no credentials are committed, logged, or copied into test fixtures.

The refresh-token workflow assumes consent and initial token acquisition happen outside this application. This implementation does not silently claim to configure tenant consent or create real calendars.

## Testing and acceptance

Use Bun's test runner and injected mock `fetch` functions; tests must not access network services or require real credentials. Cover:
- Correct refresh-token request shape for each provider.
- Correct provider endpoint, calendar mapping, query/body, and encoded identifiers.
- Conversion of provider busy/event responses to the shared contract.
- Event insertion and returned event identifiers.
- Token and calendar API error responses that do not expose secrets or response bodies.
- Equivalent output shapes for both adapters.

Before completion, run `bun run format`, `bun check`, `bun run lint`, `bun test`, `bun run build`, and `bun install --frozen-lockfile --lockfile-only`. Live integration testing and cloud setup remain explicitly pending until user-provided access is available.

## Official API references

- Google Freebusy query: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- Google event insertion: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Google OAuth offline access: https://developers.google.com/identity/protocols/oauth2/web-server#offline
- Microsoft Graph calendar view: https://learn.microsoft.com/en-us/graph/api/user-list-calendarview
- Microsoft Graph create event: https://learn.microsoft.com/en-us/graph/api/user-post-events
- Microsoft identity platform authorization code and refresh-token flow: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
