# BrightSmile Dental AI — Clinic Owner & Practice Manager Guide

This guide is for the people who **run the clinic**, not the people who write code. It explains
what the assistant does, what you need to prepare before it can book appointments, and how to
connect your existing calendars to it.

You do not need to install anything. Read [Section 2](#2-what-you-need-before-it-can-book-anything)
before you start — the assistant cannot book anything until the steps in that section are done.

---

## 1. What the Assistant Does

BrightSmile is a web assistant your patients reach in a browser. It has two faces:

- **Text chat** — a patient types a question and gets a written answer, read aloud by default.
- **Voice call** — a patient clicks **Start Voice Call** and talks to a receptionist that answers
  in speech.

Both faces do the same four things:

| It can | Example |
| :--- | :--- |
| List your services and durations | "What do you offer and how long is a root canal?" |
| Check real availability | "Is Dr. Senior 1 free on Friday morning?" |
| **Book an appointment** | "Book me a cleaning with Dr. Junior on Tuesday at 10." |
| Cancel an appointment | Requires the appointment ID (see [Q4](#frequently-asked-questions)) |

Every booking it makes is written into **both** Google Calendar and Microsoft Outlook, and a slot is
only offered when neither calendar shows a conflict.

### What it will not do

- It does not join your phone line. It is not a replacement for a telephone number — patients reach
  it through the website link you share with them.
- It does not give medical advice or prescribe medication. It will tell the patient to speak to a
  dentist.
- It cannot book outside **09:00–17:00**, in 30-minute slots.
- It has no way to move an existing appointment. Cancelling and rebooking is the only path.

### Your service catalogue and dentist rules

These are fixed in the deployment. If you change your services or add one, that is a
configuration change — contact support, it is not something you can edit in the dashboard.

| Service | Description | Duration | Eligible dentists |
| :--- | :--- | :--- | :--- |
| **A** | General Checkup & Cleaning | 1 hour | All three |
| **B** | Simple Tooth Extraction | 1 hour | All three |
| **C** | Root Canal Treatment | 2.5 hours | Dr. Senior 1, Dr. Senior 2 |
| **D** | Dental Crown / Veneer | 2 hours | Dr. Senior 1, Dr. Senior 2 |
| **E** | Full Mouth Implant Surgery | 6 hours | Dr. Senior 1, Dr. Senior 2 |

If a patient asks Dr. Junior for a root canal, the assistant explains your policy and offers a
senior specialist instead. It will not book an unqualified combination.

---

## 2. What You Need Before It Can Book Anything

The assistant is useless — actively misleading, in fact — until every item below exists. Most of
this is done **outside the app**, in Google Calendar and Microsoft 365.

> **Important:** this deployment writes to **both** calendar providers. It is not "Google *or*
> Outlook". If either side is missing, the assistant refuses to book rather than silently syncing
> only one calendar. Before going live, make sure both are covered.

### Checklist

- [ ] A dedicated calendar for each of the three dentists in **Google Calendar**.
- [ ] A dedicated calendar for each of the three dentists in **Microsoft 365 / Outlook**.
- [ ] Each Google calendar shared with the assistant's service-account email, with
      **Make changes to events** permission.
- [ ] The six **Calendar IDs** (three Google, three Outlook) written down.
- [ ] Google Cloud and Entra ID access set up by your IT administrator — see
      [Section 4](#4-google-calendar-setup-administrator) and
      [Section 5](#5-outlook--microsoft-365-setup-administrator).
- [ ] Someone who can receive a text message or email with the daily reconciliation reminder, or
      a scheduler installed — see [Section 7](#7-keeping-calendars-in-sync).

### Which of these can I do myself?

| Task | Who |
| :--- | :--- |
| Create dentist calendars in Google Calendar / Outlook | **You** (5 minutes each) |
| Copy Calendar IDs | **You** |
| Share calendars with the service account | **You** (needs the service-account email from your vendor) |
| Create the Google service account + key file | Your IT administrator, or your vendor |
| Register the app in Entra ID and grant consent | Your IT administrator |
| Run the web app and database | Whoever hosts it (vendor or IT) |
| Paste credentials into the admin console | **You or your IT administrator** |

If you have nobody technical on staff, send [Section 4](#4-google-calendar-setup-administrator)
and [Section 5](#5-outlook--microsoft-365-setup-administrator) to your vendor and ask them to
produce two things: a **Google service-account JSON key file**, and a **Microsoft refresh token**.
Everything else in this guide you can do yourself.

---

## 3. Connecting the Calendars

All of this is done in the **Admin Console** at `/admin` on your clinic's website. There is no code
to edit and no server restart — changes apply to the next booking.

### 3.1 Sign in

1. Open `https://your-clinic-site/admin`.
2. You land on the **Admin sign in** page at `/admin/login`.
3. Enter the clinic administrator username and password your vendor gave you.

> **Lost the password?** It is not recoverable from the interface. Whoever hosts the app must
> generate a new one with `bun run hash:admin-password "new-password"` and set it as
> `ADMIN_PASSWORD_HASH`. Ask them.

Once signed in you will see three tabs: **Overview**, **Calendar**, **Credentials**.

### 3.2 Create the six calendars

Do this in Google Calendar and in Outlook. Use a name your staff will recognise.

**Google Calendar** — for each dentist:

1. Under **Other calendars**, click **+ → Create new calendar**.
2. Name it e.g. `Dr. Junior — Dental Clinic`.
3. Save, then open its **Settings and sharing**.

**Outlook / Microsoft 365** — for each dentist:

1. In Outlook on the web, open **Calendar → Add calendar → Create new calendar**.
2. Name it e.g. `Dr. Senior 1 — Dental Clinic`.
3. Save.

### 3.3 Copy the six Calendar IDs

**Google:** open the calendar's **Settings and sharing**, scroll to **Integrate calendar**, copy the
**Calendar ID**. It looks like `abc123@group.calendar.google.com` or a plain email address.

**Outlook:** the calendar ID is not shown in the Outlook user interface. Someone with technical
access must read it from Microsoft Graph:

```text
GET https://graph.microsoft.com/v1.0/me/calendars
```

Copy the `id` field for each of the three dentist calendars. If nobody can run this, ask your
vendor — this is the one step that cannot be done from a browser alone.

### 3.4 Share the Google calendars with the service account

1. Open each Google calendar's **Settings and sharing**.
2. Under **Share with specific people or groups**, click **Add people**.
3. Paste the **service-account email** (it looks like
   `dental-ai@your-project.iam.gserviceaccount.com` — your vendor provides it).
4. Set permission to **Make changes to events**.
5. Send.

> **This step is silent when wrong.** A service account can only see calendars explicitly shared
> with it. The connection test in the next step will still say *Connection successful* even if you
> forgot to share — creating the calendar event is what fails, later, at booking time. Do not skip
> this for any of the three calendars.

For Outlook, no sharing step is needed: the refresh token you are given belongs to an account that
already has the dentist calendars in it.

### 3.5 Enter everything in the Admin Console

Open the **Calendar** tab.

1. **Calendar synchronization** — choose **Google Calendar + Outlook**.
   This is the only option that books appointments. *None (external calendar disabled)* exists for
   test deployments and will silently accept bookings without writing any calendar event, so do not
   leave it selected in a live clinic.
2. **Dentist mappings** — for each of the three dentists, paste **both** the Google Calendar ID and
   the Outlook Calendar ID. Both fields are required; the Save button stays disabled until every
   field is valid.
3. Open the **Credentials** tab and fill in:
   - **OpenAI → API Key** — the AI provider key.
   - **Google Calendar** — either the **Service Account Email** and **Service Account Private Key**,
     or the three delegated OAuth fields. If both are present, the service account wins.
   - **Microsoft Outlook** — Tenant ID, Client ID, Client Secret, Refresh Token.
4. Click **Save settings**.

Each credential section has its own **Test connection** button. It makes one live request to the
provider and reports one of three things:

| Message | Meaning |
| :--- | :--- |
| `Connection successful` | The provider accepted the credentials. |
| `Connection failed` | The provider rejected them — usually an expired refresh token, a revoked secret, or a missing permission. |
| `Missing credentials` | A required field is empty. |

> **What the test does not prove:** it checks that the credentials authenticate. It does **not**
> check that each dentist calendar is reachable or correctly typed. Only a real test booking does
> that. See [Section 6](#6-verify-that-it-actually-works).

### 3.6 About stored credentials

Saved secrets are encrypted before they are written to the database and are never displayed again.
The field only shows whether a secret is already configured; the eye icon reveals text you are
currently typing, never the stored value. Leaving a credential field empty keeps the previously
saved secret unchanged.

---

## 4. Google Calendar Setup (Administrator)

Skip this section if your vendor already gave you a service-account JSON key file.

### Create the service account

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Select the project for your clinic (or create one).
3. Enable the API: **APIs & Services → Library → Google Calendar API → Enable**.
4. Go to **IAM & Admin → Service Accounts → Create service account**.
5. Name it e.g. `dental-ai`, click **Create and continue**, then **Done**. No roles are needed —
   access comes from sharing the calendars, not from IAM.
6. Open the new service account → **Keys → Add key → Create new key → JSON**.
7. A `.json` file downloads. Treat it like a password: anyone with it can read and write every
   calendar shared with that service account.
8. The values you need are inside it:
   - `client_email` → paste into **Service Account Email**
   - `private_key` → paste into **Service Account Private Key** (keep the `-----BEGIN PRIVATE KEY-----`
     and `-----END PRIVATE KEY-----` lines intact)

Then go back and do [Section 3.4](#34-share-the-google-calendars-with-the-service-account) — share
all three dentist calendars with that `client_email`.

### Alternative: delegated OAuth

If your IT policy forbids service accounts, the credential form also accepts a Client ID, Client
Secret, and Refresh Token belonging to a Google account that can already see the three calendars.
The refresh token is obtained once through the
[Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground) using the scopes
`calendar.events` and `calendar.freebusy`. Full steps are in
[CALENDAR_SETUP.md](CALENDAR_SETUP.md#1-google-calendar-integration-setup).

> Google refresh tokens from an app in **Testing** mode expire after 7 days. If bookings stop
> working every Monday, this is why. Publish the OAuth consent screen, or use a service account.

---

## 5. Outlook / Microsoft 365 Setup (Administrator)

Skip this section if your vendor already gave you a refresh token.

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com/).
2. **Identity → Applications → App registrations → New registration**.
3. Name it e.g. `DentalClinicAssistant`, choose **Accounts in this organizational directory only**.
4. Record the **Application (client) ID** and **Directory (tenant) ID**.
5. **Certificates & secrets → New client secret**. Copy the value immediately — it is shown once.
6. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, add:
   - `Calendars.ReadWrite`
   - `offline_access`
7. Click **Grant admin consent**.
8. Obtain a refresh token by authorising once in a browser and exchanging the returned code — the
   exact URLs and a `curl` example are in
   [CALENDAR_SETUP.md](CALENDAR_SETUP.md#c-obtain-microsoft-refresh-token).

> Entra ID may issue a **new** refresh token each time it is used. If your tenant enforces token
> rotation, the stored token eventually stops working and must be updated. The **Test connection**
> button will report `Connection failed` when that happens.

---

## 6. Verify That It Actually Works

The connection test is not enough. Do this once, before telling patients the link exists.

1. Open the clinic website in a private browser window.
2. Click **Conversational Voice Call** → **Start Voice Call**, allow microphone access, and ask:
   *"What services do you offer?"* — you should hear a spoken answer.
3. Ask it to book something in a slot that is genuinely free, using a name and phone number you can
   identify as a test (e.g. `TEST BOOKING`).
4. Check the results:
   - The **Dentist Schedules** tab shows the appointment in the right dentist's row.
   - The corresponding event appears in **both** the Google Calendar and the Outlook calendar you
     mapped for that dentist.
5. Cancel the test booking so it does not block a real slot.

If step 4 shows the event in only one calendar, or in neither, stop and read
[Section 8](#8-troubleshooting).

---

## 7. Keeping Calendars in Sync

Sometimes Google or Microsoft is briefly unreachable while a patient is booking. The assistant
handles this without lying to the patient, but it needs one piece of outside help to recover.

### What happens when a write fails

- The appointment is saved locally with status **pending**, and the slot stays blocked so two
  patients cannot take it.
- The failed write is recorded per provider, with a retry time.
- The appointment **does not appear in the Dentist Schedules tab** until it is fully confirmed —
  that tab shows confirmed bookings only. A silently pending booking is therefore easy to miss.

### What you must set up

Retries only run when something calls the reconciliation endpoint on a schedule. This is a step
**outside the app**:

```bash
curl -X POST "https://your-clinic-site/api/v1/admin/reconcile-calendar?limit=25" \
  -H "Authorization: Bearer $CALENDAR_RECONCILE_TOKEN"
```

Your host or IT administrator needs to:

1. Generate a random 32-byte hex token and set it as `CALENDAR_RECONCILE_TOKEN`.
2. Schedule the call above — a cloud cron job, Vercel Cron, or any scheduler — every few minutes.

If `CALENDAR_RECONCILE_TOKEN` is not set, the endpoint returns `503` and **nothing is ever retried**.
Bookings will stay pending indefinitely. Ask your vendor to confirm this is configured before
going live.

Failed writes are retried with exponential backoff, up to 8 attempts. After that the appointment is
flagged `needs_manual_reconciliation` and needs a human. There is currently no screen for this —
your vendor or IT administrator must query the `appointment_calendar_syncs` table.

---

## 8. Troubleshooting

### "Both Google Calendar and Outlook must be configured. Missing: …"

The deployment is refusing to start booking because a provider block is incomplete. The message
after `Missing:` names exactly what is absent, e.g. `Google credentials`, `Outlook dentist calendar
IDs`. Fill in the named items in the **Calendar** or **Credentials** tab, save, and try again.

### Test connection says `Connection successful`, but bookings never reach a calendar

Almost always the calendar-sharing step. A service account can authenticate perfectly and still
have zero access to a calendar that was never shared with it. Re-check
[Section 3.4](#34-share-the-google-calendars-with-the-service-account) for **all three** dentists.

### Test connection says `Connection failed`

- **Google (service account):** the private key was pasted with its newlines mangled. Re-copy the
  whole `private_key` value including the BEGIN/END lines.
- **Google (delegated):** a Testing-mode consent screen expires refresh tokens after 7 days.
- **Microsoft:** the client secret expired, or the refresh token was rotated. Re-issue and save.

### The voice call says "Voice provider has no free session slots"

The voice provider allows a limited number of simultaneous calls, and they are all in use. If you
self-host the voice model, this limit is set by how many sessions that server was started with —
contact whoever runs it. If you use a hosted provider, the limit is on their plan.

### The voice call says "Voice provider reported an error"

The assistant connected but the voice server rejected the session setup. This is a deployment issue,
not something you can fix from the admin console — report it to your vendor.

### The assistant cannot hear me, or I hear nothing

1. Check the browser has microphone permission for the site (the padlock in the address bar).
2. Voice does not work over plain `http://` on a phone or another computer — the site needs
   `https://`. A `localhost` address only works on the machine running the server.
3. Voice activity detection ignores beeps and test tones. Speak normally; it will not respond to a
   generated sine wave.

### An appointment went missing from the schedule

Pending bookings are hidden until both calendars confirm. If it is genuinely lost, ask your vendor
to check `appointment_calendar_syncs` for a `needs_manual_reconciliation` row.

### Chat replies are silent

Auto-read is off, or the text-to-speech service is unreachable. Replies still appear on screen —
use the **Read aloud** button on each reply, or switch **Auto-read** back on in the chat header.

---

## 9. Using the Staff Dashboard

The clinic site has four tabs across the top:

| Tab | What it is for |
| :--- | :--- |
| **AI Text Chat** | The patient-facing chat window. Replies are read aloud by default; **Auto-read on/off** in the chat header disables that, and each reply has a **Read aloud** button. |
| **Conversational Voice Call** | The patient-facing voice call. Click **Start Voice Call**. |
| **Dentist Schedules** | Today's or any future date's confirmed bookings for Dr. Junior, Dr. Senior 1, and Dr. Senior 2. Click **Refresh** to pull the latest. |
| **Dental Services (5)** | The service catalogue with durations and which dentists can perform each one. |

The **Dentist Schedules** tab shows confirmed bookings only. A booking that is still pending a
calendar write will not appear there — see [Section 7](#7-keeping-calendars-in-sync).

---

## Frequently Asked Questions

#### Q1: What if a patient asks for medical advice or an antibiotic prescription?

The assistant is instructed not to diagnose or prescribe, but its wording is not guaranteed. A
typical response:

> *"I am an automated scheduling assistant and cannot provide medical diagnoses or prescribe
> medications. Please discuss your symptoms with our dentist during your appointment, or seek
> emergency medical attention if you are in severe pain."*

Staff should still review voice transcripts for anything clinical that slipped through.

#### Q2: Can a patient book outside clinic hours?

No. Bookings are enforced at **09:00–17:00**, aligned to 30-minute slots. The assistant cannot book
a start before 09:00 or an end after 17:00, and the server rejects such a request even if the
assistant tries.

#### Q3: What if a dentist adds an appointment directly in Google or Outlook?

Both calendars are checked before a slot is offered. A manually added event blocks that time. If a
calendar is unreachable, the assistant refuses to report the booking as confirmed rather than
guessing.

#### Q4: Can a patient cancel over the phone?

Not in practice. Cancellation needs the **appointment ID**, which is a long identifier a patient
will not know. There is no "cancel by name and phone number" lookup. Staff should cancel through
the normal process; the assistant's `cancel_appointment` capability is mainly reachable from
chat when an ID is available.

#### Q5: Does it work on a phone?

Yes, in a mobile browser with `https://`. It is not a native app, and it is not a phone number
patients can dial.

#### Q6: How many patients can talk to it at once?

Voice sessions are limited by the voice provider, not by the clinic app. A self-hosted voice server
running one session will reject the second caller with "Voice provider has no free session slots".
Hosted providers scale with their plan.

#### Q7: Can I change the services, or clinic hours?

Not from the dashboard. These are fixed in the deployment configuration. Contact support.

---

## Support

- **Practice support:** support@brightsmileclinic.com
- **Technical reference (for your IT team):** [INTERNAL_ARCHITECTURE_AND_COST.md](INTERNAL_ARCHITECTURE_AND_COST.md)
- **Calendar / OAuth details:** [CALENDAR_SETUP.md](CALENDAR_SETUP.md)
