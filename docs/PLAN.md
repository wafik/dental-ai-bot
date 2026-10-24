# Project Plan: Dental Clinic Conversational AI Appointment Bot

**Target Role:** Forward Deployment Engineer — Functional AI Solutions  
**Deadline / Interview Date:** Saturday, October 31, 2026 (09:00 WIB / 10:00 AM GMT+8)

> This project uses one repository for the frontend and backend. The directory layout below follows the modular conventions in the Compass frontend and backend guidelines; it does not split the application into separate FE and BE repositories.

---

## 1. Requirements Breakdown

### A. Dental Clinic Business Rules (3 Dentists, 5 Services)
The system supports **3 dentists** and **5 services**, each with a defined duration and provider-qualification constraint:

| Code | Service | Duration | Eligible Dentists |
| :--- | :--- | :--- | :--- |
| **Service A** | General Checkup & Cleaning | 1 hour | Junior, Senior 1, Senior 2 |
| **Service B** | Simple Tooth Extraction | 1 hour | Junior, Senior 1, Senior 2 |
| **Service C** | Root Canal Treatment | 2.5 hours | Senior 1, Senior 2 |
| **Service D** | Dental Crown / Veneer | 2 hours | Senior 1, Senior 2 |
| **Service E** | Full Mouth Implant Surgery | 6 hours | Senior 1, Senior 2 |

- **Language:** English only.
- **Scope and guardrails:** The bot must decline requests outside dental-clinic appointment services, including in-depth medical consultations and unrelated general topics. It must observe clinic hours and check live availability for the full duration of each service.

### B. Core Technical Capabilities
1. **Text Chat and Conversational Voice AI:** Support two-way text and real-time voice conversations—not static transcription—with a provider-agnostic AI integration that can use Gemini Live, OpenAI Realtime, Vapi, ElevenLabs, or Deepgram.
2. **Google Calendar and Microsoft Outlook Sync:** Read and write schedules in both calendar systems. Use a shared calendar-provider contract and separate adapters so both providers follow the same booking rules.

### C. Deliverables
1. **Working Web App:** An interactive application with chat, a conversational voice interface, and a dashboard/calendar preview.
2. **Internal Documentation:** System architecture, production and maintenance cost estimates, technology decisions, and security/safety guardrails.
3. **External Documentation:** A non-technical product overview for clinic owners and setup/use instructions, including Google Cloud and Microsoft OAuth/calendar configuration outside the application.

---

## 2. Architecture and Technology Stack

### Runtime, Framework, and UI
- **Runtime:** Bun **>= 1.4.4**. This exceeds the requested Bun 1.4.3 minimum and supports the `bun check` quality gate used in the Compass guidelines. The current local Bun version checked for this plan is 1.4.4.
- **Frontend:** Next.js **16.4.3** with the App Router and React **19.3.1**.
- **Styling:** Tailwind CSS **4.3.3**.
- **UI components:** shadcn/ui; the latest CLI version checked for this plan is **4.22.1**. Run the CLI from the repository root with `bunx --bun shadcn@latest`. Add only the components the app needs, and prefer shadcn/ui components over custom equivalents.
- **UI and forms:** Use a reusable toast API for feedback, a reusable searchable select for dropdowns, and a show/hide eye toggle for password fields. Validate forms with Zod and show validation feedback in real time as users edit.
- **Type checking, linting, and formatting:** `bun check`, `oxlint`, and `oxfmt`. Keep lint output free of warnings and errors.
- **Repository:** One repository contains the Next.js frontend, API delivery layer, domain logic, integrations, tests, and documentation.

### Backend and API Layer
Use Next.js App Router Route Handlers for the API delivery layer, with routes grouped under `/api/v1`. Keep HTTP handling thin and put business rules in domain/services modules. This keeps the interview/demo deployment in one application while preserving the modular backend structure used in Compass.

### AI Layer
- Define one `LLMProvider` contract for the provider-agnostic integration.
- Start with one selected provider and implement the shared appointment tools: `check_availability`, `book_appointment`, `cancel_appointment`, and `list_services`.
- Add another provider adapter only when a real fallback or provider switch is needed; do not scaffold unused integrations.

### Calendar Layer
- Define one `CalendarProvider` contract for the operations required by scheduling.
- Implement `GoogleCalendarAdapter` and `OutlookCalendarAdapter` for Google Calendar API v3 and Microsoft Graph Calendar.
- Keep provider-specific calendar IDs and credentials in configuration, not in appointment business rules.

### Database and Booking State
Use PostgreSQL or SQLite for appointment state, conversation/audit records, dentist-to-calendar mappings, and booking conflict prevention. Enforce dentist qualifications and appointment duration in backend domain/service logic before writing to any calendar. Prevent double booking with an atomic database operation or lock appropriate to the selected database.

---

## 3. Single-Repository Directory Structure

```text
dental-ai-bot/
├── src/
│   ├── app/
│   │   ├── (clinic)/                 # Next.js pages and layouts
│   │   └── api/v1/                   # Versioned Route Handlers (delivery layer)
│   ├── components/
│   │   └── ui/                       # shadcn/ui components added to this repo
│   ├── features/
│   │   └── appointments/
│   │       ├── _interface/           # Page-scoped types and shared contract re-exports
│   │       ├── _service/             # Frontend API-client wrappers
│   │       ├── _constant/            # Local constants, Zod schemas, form defaults
│   │       └── components/           # Appointment feature UI
│   ├── config/                       # Environment and integration configuration
│   ├── domain/                       # Dentist, service, appointment, and scheduling rules
│   ├── repository/                   # Database and calendar-state persistence
│   ├── services/                     # Scheduling and appointment use cases
│   ├── providers/
│   │   ├── ai/                       # Provider contract and selected AI adapter
│   │   └── calendar/                 # Shared contract, Google and Outlook adapters
│   ├── safety/                       # Scope guardrails, PII handling, rate limits
│   └── lib/                          # Shared utilities and API client
├── docs/
│   ├── PLAN.md
│   ├── INTERNAL_ARCHITECTURE_AND_COST.md
│   └── EXTERNAL_CLIENT_GUIDE.md
├── tests/                            # Scheduling, API, and integration tests
└── README.md
```

Keep shared domain enums/constants in one shared location rather than duplicating string unions across modules. Frontend feature modules should follow the `_interface` / `_service` / `_constant` pattern; backend code should follow the `config` / `domain` / `repository` / `services` / delivery-layer pattern. All of these folders remain in this single repository.

---

## 4. Seven-Day Implementation Schedule (October 24–30, 2026)

### Day 1 (Saturday, October 24): Domain Rules and Scheduling Engine
- [x] Initialize the single repository with the runtime, Next.js, Tailwind CSS, and shadcn/ui setup described above.
- [x] Define the dentist and service rules for all 3 dentists and 5 services.
- [x] Implement and test a slot finder that checks clinic hours, existing appointments, dentist eligibility, and the full service duration. Service E must require 6 consecutive available hours with Senior 1 or Senior 2.

### Day 2 (Sunday, October 25): Google Calendar and Outlook Integration
- [x] Define provider-neutral `CalendarProvider` contract with `getBusyIntervals` and `createEvent`, custom `CalendarProviderError`, and strict RFC3339 interval normalization (`src/providers/calendar/`).
- [x] Implement runtime environment configuration for Google Calendar and Microsoft Graph with per-dentist mappings and `.env.example` template (`src/config/calendar.ts`).
- [x] Implement `GoogleCalendarAdapter` with OAuth refresh token exchange, in-memory token caching, Freebusy queries, and event creation, verified with mocked HTTP tests (`tests/google-calendar-adapter.test.ts`).
- [x] Implement `OutlookCalendarAdapter` with Microsoft Entra OAuth refresh, calendarView queries, multi-page `@odata.nextLink` pagination, and event creation, verified with mocked HTTP tests (`tests/outlook-calendar-adapter.test.ts`).
- [x] Verify provider parity with contract compliance tests (`tests/calendar-contract.test.ts`).
- [x] Document external cloud provisioning, OAuth scope requirements, and token lifecycle in `docs/CALENDAR_SETUP.md`.
- [ ] External cloud setup: Provision Google Cloud project, OAuth consent, and 3 dentist calendars (pending operator credentials).
- [ ] External cloud setup: Register Microsoft Entra ID application and grant delegated `Calendars.ReadWrite` permission (pending operator credentials).
- [ ] Live integration testing: Execute end-to-end free/busy and event creation against live Google and Microsoft accounts once external credentials are provided.

### Day 3 (Monday, October 26): Chat AI and Tool Calling
- [x] Write the English system prompt and define the dental-appointment scope guardrails (`src/safety/system-prompt.ts`, `tests/system-prompt-guardrails.test.ts`).
- [x] Decline requests outside clinic appointment services and reject Services C, D, and E when a user requests the Junior dentist.
- [x] Connect the AI provider to the shared availability and appointment-booking tools (`src/services/appointment-tools.ts`, `src/services/chat-orchestrator.ts`).
- [x] Validate all tool inputs and business rules in backend services; do not rely on the model prompt as enforcement (`src/services/appointment-service.ts`, `tests/appointment-service.test.ts`).
- [x] Implement PostgreSQL schema and repository using Drizzle ORM (`src/repository/schema.ts`, `DrizzleAppointmentRepository`, `InMemoryAppointmentRepository`).

### Day 4 (Tuesday, October 27): Conversational Voice AI
- [x] Implement real-time browser voice conversation using the selected provider's supported browser transport (WebRTC with ephemeral session token via `/api/v1/voice/session`).
- [x] Reuse the same availability and booking tools as text chat so spoken requests use the same server-side validation and calendar operations (`/api/v1/voice/tools`, `VoiceSessionManager`).

### Day 5 (Wednesday, October 28): Web UI and Safety
- [x] Build the chat and voice-call interface with accessible controls (`ChatWidget`, `VoiceCallWidget`, `Badge`, `Input`).
- [x] Add a live calendar/status preview for all 3 dentists and a service list for the demo (`SchedulePreview`, `ServicesCatalog`, `GET /api/v1/appointments`).
- [x] Add input validation, explicit user confirmation, prompt-injection defenses, and rate limiting (`sanitizeUserInput`, `SlidingWindowRateLimiter`, `/api/v1/chat`).

### Day 6 (Thursday, October 29): Documentation
- [x] Write `INTERNAL_ARCHITECTURE_AND_COST.md` with:
  - A Mermaid architecture diagram showing the shared AI provider contract and the Google/Outlook calendar adapters.
  - A concrete monthly estimate using an explicit workload assumption (for example, 1,000 calls/month averaging 3 minutes plus 3,000 chats), itemized by AI, speech/voice, hosting, and database costs.
  - Trade-offs and decisions for provider adapters, concurrent booking prevention, and voice latency.
  - Scope guardrails, patient-data protection considerations (HIPAA/GDPR awareness), and server-side tool-call validation.
- [x] Write `EXTERNAL_CLIENT_GUIDE.md` with:
  - A plain-language description of the product's business value for a dental-clinic owner.
  - Step-by-step instructions to grant Google Calendar access, connect the clinic's Microsoft Outlook account, and use the dashboard or website widget.

### Day 7 (Friday, October 30): End-to-End Testing and Demo Preparation
- [x] Test the following edge cases:
  1. Request Service E (6 hours) with the Junior dentist → decline politely and offer Senior 1 or Senior 2 (`tests/day-7-edge-cases.test.ts`).
  2. Request a slot already occupied in Google Calendar → offer available alternatives (`tests/day-7-edge-cases.test.ts`).
  3. Ask about an unrelated topic, such as a recipe or stock advice → decline and redirect to dental-clinic appointments (`tests/day-7-edge-cases.test.ts`).
  4. Submit competing booking requests for the same dentist and time → accept no more than one booking (`tests/day-7-edge-cases.test.ts`).
- [x] Run `bun check`, `oxlint src tests e2e`, `oxfmt`, and `bun test`; resolve all errors and warnings.
- [x] Implement Playwright E2E tests (`e2e/portal-and-booking.spec.ts`) capturing high-res screenshots and animated GIF walkthrough (`docs/screenshots/dental-ai-demo.gif`).
- [x] Prepare a stable demo environment, either a public deployment or a reliable local tunnel, for the Saturday interview.

---

## 5. Interview Evaluation Checklist

- [x] **Provider-agnostic design is visible in the code:** Show the AI provider configuration and the shared contract; switching providers must not require changing appointment business rules.
- [x] **Calendar adapters are demonstrated:** Show both Google Calendar and Outlook using the same scheduling rules through their respective adapters.
- [x] **Backend validation is authoritative:** Reject Junior dentist assignments for Services C, D, and E in server-side logic even if the AI requests them.
- [x] **Production costs are realistic:** Include a specific USD price breakdown per 1,000 interactions in the internal documentation, based on dated provider and hosting prices.
- [x] **The application remains one repository:** Frontend, API delivery, domain logic, integrations, tests, and documentation are organized into modules without creating separate FE and BE repositories.
