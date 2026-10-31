# External Calendar Setup Guide

This guide explains how to configure Google Cloud and Microsoft Entra ID for the dental appointment scheduling system.

In this phase, the application uses **delegated OAuth 2.0** with long-lived refresh tokens supplied via environment variables. Initial user consent and refresh-token acquisition are performed outside the application.

---

## 1. Google Calendar Integration Setup

### A. Google Cloud Project & OAuth Consent
1. Log in to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project (e.g. `dental-ai-clinic`).
3. Enable the **Google Calendar API**:
   - Navigate to **APIs & Services > Library**.
   - Search for "Google Calendar API" and click **Enable**.
4. Configure the **OAuth Consent Screen**:
   - Navigate to **APIs & Services > OAuth consent screen**.
   - Choose User Type: **Internal** (for Google Workspace) or **External** (in Testing mode with your email added as a test user).
   - Enter application details (e.g. App name: "Dental Appointment Bot").
   - Add OAuth Scopes:
     - `https://www.googleapis.com/auth/calendar.events` (for event insertion)
     - `https://www.googleapis.com/auth/calendar.freebusy` (for checking doctor availability)
5. Create OAuth 2.0 Client Credentials:
   - Navigate to **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
   - Select Application Type: **Web application**.
   - Add an Authorized Redirect URI for initial token retrieval (e.g. `https://developers.google.com/oauthplayground` for manual generation).
   - Note down the generated **Client ID** and **Client Secret**.

### B. Obtain Google Refresh Token
To obtain a long-lived refresh token offline:
1. Open [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
2. Click the gear icon (top right) and check **Use your own OAuth credentials**, entering your Client ID and Client Secret.
3. In Step 1, select the Google Calendar API v3 scopes:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.freebusy`
4. Click **Authorize APIs** and authenticate with the Google account managing the clinic calendars.
5. In Step 2, click **Exchange authorization code for tokens**.
6. Copy the resulting `refresh_token`.

### C. Create Dentist Calendars in Google
1. Open [Google Calendar](https://calendar.google.com/).
2. Under "Other calendars", click **+ > Create new calendar** for each dentist:
   - Junior Dentist: "Dr. Junior - Dental Clinic"
   - Senior 1 Dentist: "Dr. Senior 1 - Dental Clinic"
   - Senior 2 Dentist: "Dr. Senior 2 - Dental Clinic"
3. In each calendar's settings, find the **Calendar ID** (under "Integrate calendar", format: `c_...@group.calendar.google.com` or an email address).

---

## 2. Microsoft 365 / Outlook Setup (Microsoft Graph)

### A. Microsoft Entra ID App Registration
1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com/) or Azure Portal.
2. Navigate to **Identity > Applications > App registrations > New registration**.
3. Name the application (e.g. `DentalClinicAssistant`).
4. Supported account types: **Accounts in this organizational directory only** (Single tenant) or **Accounts in any organizational directory** (Multitenant).
5. Set Redirect URI (Web): `https://login.microsoftonline.com/common/oauth2/nativeclient` or your admin callback URL.
6. Record:
   - **Application (client) ID**
   - **Directory (tenant) ID**
7. Under **Certificates & secrets**, create a **New client secret** and copy the secret value.

### B. API Permissions & Consent
1. Navigate to **API permissions > Add a permission > Microsoft Graph**.
2. Select **Delegated permissions**:
   - `Calendars.ReadWrite` (allows reading free/busy schedules and booking events)
   - `offline_access` (required during the initial consent request to obtain a refresh token)
3. Click **Grant admin consent for <your-organization>**.

### C. Obtain Microsoft Refresh Token
1. Construct the authorization URL in your browser:
   ```text
   https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize?client_id={CLIENT_ID}&response_type=code&redirect_uri={REDIRECT_URI}&response_mode=query&scope=https://graph.microsoft.com/Calendars.ReadWrite%20offline_access
   ```
2. Sign in as the clinic operator and approve consent.
3. Extract the `code` parameter from the redirected URL.
4. Exchange the authorization code for tokens using `curl` or Postman:
   ```bash
   curl -X POST "https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "client_id={CLIENT_ID}" \
     -d "client_secret={CLIENT_SECRET}" \
     -d "grant_type=authorization_code" \
     -d "code={CODE}" \
     -d "redirect_uri={REDIRECT_URI}"
   ```
5. Extract and store the `refresh_token` from the JSON response.

### D. Dentist Calendars in Microsoft 365
Because delegated access queries the `/me/calendars/{calendarId}` endpoint:
1. The 3 dentist calendars must be created within (or shared with write access into) the authenticated user's account in Outlook.
2. To obtain calendar IDs, make a `GET https://graph.microsoft.com/v1.0/me/calendars` call with the access token.
3. Copy the `id` field for Junior, Senior 1, and Senior 2 calendars.

---

## 3. Environment Variables Configuration

Copy `.env.example` to `.env` and fill in the values obtained above:

```bash
CALENDAR_PROVIDER=both # or "none" for local-only mode

# Google Calendar
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REFRESH_TOKEN=your-google-refresh-token
GOOGLE_CALENDAR_JUNIOR=junior-calendar-id@group.calendar.google.com
GOOGLE_CALENDAR_SENIOR_1=senior-1-calendar-id@group.calendar.google.com
GOOGLE_CALENDAR_SENIOR_2=senior-2-calendar-id@group.calendar.google.com

# Microsoft Outlook
MICROSOFT_TENANT_ID=your-microsoft-tenant-id
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_REFRESH_TOKEN=your-microsoft-refresh-token
MICROSOFT_CALENDAR_JUNIOR=your-microsoft-calendar-id-junior
MICROSOFT_CALENDAR_SENIOR_1=your-microsoft-calendar-id-senior-1
MICROSOFT_CALENDAR_SENIOR_2=your-microsoft-calendar-id-senior-2

# Retry scheduler token
CALENDAR_RECONCILE_TOKEN=your-random-32-byte-hex-token
```

Both provider blocks are required when `CALENDAR_PROVIDER` is not `none`: resolution throws with the
list of missing variables rather than silently syncing only one calendar.

---

## 4. OAuth Scope and Token Lifecycle Details

### Google OAuth Token Refresh
- **Endpoint**: `POST https://oauth2.googleapis.com/token`
- **Body**: `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`
- **Behavior**: Google refresh tokens generally remain valid indefinitely until revoked, unless the app is in "Testing" mode (in which case refresh tokens expire after 7 days).

### Microsoft Entra Token Refresh
- **Endpoint**: `POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`
- **Body**: `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`, and resource scope `scope=https://graph.microsoft.com/Calendars.ReadWrite`.
- **CRITICAL**: Do NOT include `offline_access` in the refresh request body. In Entra ID, `offline_access` is valid only on initial authorization; including it during token refresh triggers an `invalid_scope` (`AADSTS70011`) error.
- **Token Rotation**: Entra ID may return a new `refresh_token` in the response when refreshing. In this phase (configuration-based tokens), operators must update the configured `MICROSOFT_REFRESH_TOKEN` if a token rotation policy is enforced on the tenant.

---

## 5. Current Scope and Operational Boundaries

The current implementation includes:
- Provider-neutral contract (`CalendarProvider`) in `src/providers/calendar/calendar-provider.ts`.
- In-memory delegated access token caching with automatic proactive refresh 60 seconds before expiration.
- Complete Google Calendar API v3 adapter (`GoogleCalendarAdapter`) and Microsoft Graph REST adapter (`OutlookCalendarAdapter`).
- Dual writes: every booking is created in both Google Calendar and Outlook, and every cancellation deletes the event from both.
- Durable per-provider sync state (`appointment_calendar_syncs`): a booking stays `pending` and a cancellation stays `cancelling` until both providers converge.
- Comprehensive unit, error, and parity contract tests using mocked HTTP requests.

The current implementation intentionally does **not** include:
- In-app interactive OAuth consent UI or callback route handlers.
- Database persistence or automatic rotation of refresh tokens.
- Event rescheduling (moving an existing event); cancellation deletes and rebooking creates.
- Live network requests or automated cloud resource provisioning during automated CI test runs. Live integration testing will be conducted once cloud resources are provisioned.

---

## 6. Retrying Failed Writes

A provider failure never produces a false "booked" or "cancelled" state:

- The appointment stays `pending` (booking) or `cancelling` (cancellation), and its slot stays
  blocked.
- One row per provider is written to `appointment_calendar_syncs` with its own status, attempt
  count, and next retry time.
- Google creates use the appointment UUID (dashes removed) as the caller-supplied event ID and are
  `PUT`-upserted, so a retry cannot duplicate the event.
- Microsoft Graph assigns event IDs, so an ambiguous Outlook create is flagged
  `needs_manual_reconciliation` instead of being retried blindly. Deletes are idempotent at both
  providers and are always retried.

Retries run when an external scheduler calls the secured endpoint:

```bash
curl -X POST "https://your-app.example/api/v1/admin/reconcile-calendar?limit=25" \
  -H "Authorization: Bearer $CALENDAR_RECONCILE_TOKEN"
```

The response contains counts only (`claimed`, `succeeded`, `retried`, `manual`, `confirmed`,
`cancelled`); provider error bodies, tokens, and patient data are never returned. Rows are claimed
with a lease, so overlapping scheduler runs cannot process the same row twice. Each row is retried
with exponential backoff up to 8 attempts, then marked `needs_manual_reconciliation` for staff.

Set `CALENDAR_RECONCILE_TOKEN` to a random value (32 bytes) and schedule the call from your existing
platform scheduler (for example a cloud cron job or Vercel Cron with the token stored as a secret).
The endpoint returns 503 when the token is not configured.
