# 🦷 BrightSmile Dental Clinic — Conversational AI Appointment System

[![Bun](https://img.shields.io/badge/Bun-v1.4.4-black?logo=bun)](https://bun.sh)
[![Next.js](https://img.shields.io/badge/Next.js-16.4.3-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.3.1-blue?logo=react)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4.3.3-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)](https://www.typescriptlang.org)
[![Playwright](https://img.shields.io/badge/Playwright-E2E%20Tested-green?logo=playwright)](https://playwright.dev)

A modern, production-grade conversational AI assistant designed for dental clinics. Enables patients to check availability, schedule appointments, and inquire about treatments using **two-way real-time voice calls** (WebSocket streaming, provider-agnostic) and **interactive text chat**, backed by **authoritative dentist qualification rules** and **bidirectional calendar sync** with both **Google Calendar** and **Microsoft Outlook**.

---

## 🎬 Live Interactive Preview

![BrightSmile Dental AI Receptionist Walkthrough](docs/screenshots/dental-ai-demo.gif)

---

## 📸 Interface Screenshots

| 💬 AI Text Chat | 🎙️ Real-Time Voice Assistant |
| :---: | :---: |
| ![AI Chat Portal](docs/screenshots/01-ai-chat-portal.png) | ![Voice Call Widget](docs/screenshots/02-voice-call-widget.png) |
| **📅 Dentist Live Schedules** | **🩺 Services Catalog & Qualifications** |
| ![Dentist Schedules](docs/screenshots/03-dentist-schedules.png) | ![Services Catalog](docs/screenshots/04-services-catalog.png) |

---

## 📋 Core Clinical Rules & Doctor Qualifications

The clinic operates daily from **09:00 to 17:00 (Asia/Jakarta / UTC+7)**. The system enforces strict provider qualification constraints:

| Code | Service Name | Duration | Eligible Dentists | Clinical Constraints |
| :--- | :--- | :--- | :--- | :--- |
| **Service A** | General Checkup & Cleaning | 1.0 Hour (60 min) | Dr. Junior, Dr. Senior 1, Dr. Senior 2 | Open to all providers |
| **Service B** | Simple Tooth Extraction | 1.0 Hour (60 min) | Dr. Junior, Dr. Senior 1, Dr. Senior 2 | Open to all providers |
| **Service C** | Root Canal Treatment | 2.5 Hours (150 min) | Dr. Senior 1, Dr. Senior 2 | **Specialists only** (Junior strictly prohibited) |
| **Service D** | Dental Crown / Veneer | 2.0 Hours (120 min) | Dr. Senior 1, Dr. Senior 2 | **Specialists only** (Junior strictly prohibited) |
| **Service E** | Full Mouth Implant Surgery | 6.0 Hours (360 min) | Dr. Senior 1, Dr. Senior 2 | **Requires 6 continuous hours** with a Senior Specialist |

> 🛡️ **Authoritative Server Enforcement:** Clinical qualification checks are executed in the core backend domain service (`AppointmentService`). Even if a user attempts prompt injection or an LLM requests Dr. Junior for Service C/D/E, the server immediately rejects the request.

---

## 🏗️ Architecture & Technology Stack

```
dental-ai-bot/
├── src/
│   ├── app/                      # Next.js 16 App Router pages & API route handlers
│   │   ├── page.tsx              # Unified clinical portal (Chat, Voice, Matrix, Services)
│   │   └── api/v1/
│   │       ├── chat/             # Guarded text chat delivery with rate limiter
│   │       ├── voice/session/    # Provider selection + ephemeral Gemini token gate
│   │       ├── voice/tools/      # Authoritative tool execution for voice events
│   │       └── appointments/     # Daily schedule query & direct booking API
│   ├── components/               # UI components (ChatWidget, VoiceWidget, SchedulePreview)
│   ├── domain/                   # Pure business logic (Dentists, Services, Scheduling engine)
│   ├── features/voice/           # VoiceSessionManager, discrete Gemini Live and
│   │                             #   OpenAI Realtime-compatible transports, shared audio plumbing
│   ├── providers/
│   │   ├── ai/                   # Provider-neutral LLM contract & OpenAI adapter
│   │   ├── calendar/             # Provider-neutral Calendar contract, Google & Outlook adapters
│   │   └── voice/                # Voice provider contract, Gemini Live & OpenAI-compatible adapters
│   ├── repository/               # PostgreSQL persistence (Drizzle ORM) + In-Memory repository
│   ├── safety/                   # Prompt injection defense, medical deflection & rate limiter
│   └── services/                 # Chat orchestrator, AppointmentService & tool definitions
├── e2e/                          # Playwright end-to-end tests
├── tests/                        # Bun unit, integration, and contract test suites
└── docs/                         # Architecture, cost model, and client documentation
```

### Key Highlights:
1. **Zero Client Secret Leakage:** Master API keys never reach client browsers. With Gemini Live the server mints a short-lived single-use token via `/api/v1/voice/session`; with an OpenAI Realtime-compatible endpoint there is no token to mint and the browser connects to the configured WebSocket directly.
2. **Dual-Calendar Parity:** Unified `CalendarProvider` contract synchronizes bookings with **Google Calendar (API v3)** and **Microsoft Outlook (Microsoft Graph)** with canonical RFC3339 UTC timestamps.
3. **Enterprise Safety & Guardrails:** 
   - `sanitizeUserInput`: Intercepts prompt injections (`DAN`, `ignore previous instructions`, `leak system prompt`).
   - Medical Advice Deflection: Automatically deflects medical diagnosis and prescription requests with clinical disclaimers before LLM token consumption.
   - `SlidingWindowRateLimiter`: In-memory IP-based rate limiting guarding API endpoints against quota abuse.
4. **PostgreSQL & Drizzle ORM:** Booking reservations are guarded by a PostgreSQL
   transaction-scoped advisory lock per dentist/date plus an overlap check, so two concurrent
   requests cannot both reserve an overlapping slot. Includes an offline
   `InMemoryAppointmentRepository` for zero-dependency CI testing.

---

## 🚀 Quickstart Guide

### Prerequisites
- **Bun**: `>= 1.4.3` (installed: `bun@1.4.4`)
- Node.js environment (for optional Playwright browser execution)

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/wafik/dental-ai-bot.git
cd dental-ai-bot

# Install dependencies using Bun
bun install
```

### 2. Environment Setup

Create a `.env.local` file by copying the template:

```bash
cp .env.example .env.local
```

Configure your API keys as needed (mock adapters run out-of-the-box for offline testing):
```env
OPENAI_API_KEY="sk-proj-your-openai-api-key"
CLINIC_TIMEZONE="Asia/Jakarta"
CALENDAR_PROVIDER="both" # or "none" for local-only mode
KOKORO_TTS_BASE_URL="http://localhost:8880/v1"
KOKORO_TTS_VOICE="af_heart"

# Voice: pick one. GEMINI_API_KEY wins when both are set.
GEMINI_API_KEY="your-gemini-api-key"
# OPENAI_COMPATIBLE_VOICE_URL="ws://127.0.0.1:8765/v1/realtime"
```

Voice has two implementations behind one contract. With `GEMINI_API_KEY` set, the server mints a
single-use Gemini Live token and the browser connects to the constrained Gemini socket. With only
`OPENAI_COMPATIBLE_VOICE_URL` set, the browser connects straight to that OpenAI Realtime GA endpoint
(a self-hosted speech-to-speech server, OpenAI itself, or another compatible provider) — no token is
minted because there is none to mint. The role and the appointment tools are supplied by the server
in both cases, so the client cannot widen the assistant's scope. `GET /api/v1/voice/session` reports
which provider is active; the browser uses it to choose a transport.

Every booking is written to **both** Google Calendar and Outlook. Calendar resolution is
fail-closed: with `CALENDAR_PROVIDER="both"` (the default), a missing provider credential block or a
missing per-dentist calendar ID makes the app throw instead of silently skipping a calendar. Use
`CALENDAR_PROVIDER="none"` only for local development without external calendars.

If a provider write fails, the appointment stays `pending`, its slot stays blocked, and the
per-provider work is recorded for retry. Point an external scheduler at
`POST /api/v1/admin/reconcile-calendar` with the `CALENDAR_RECONCILE_TOKEN` bearer token to drain
retries with backoff; see [docs/CALENDAR_SETUP.md](docs/CALENDAR_SETUP.md#6-retrying-failed-writes).

Text chat reads new assistant replies aloud by default. Patients can turn **Auto-read** off in the
chat header or use a reply's **Read aloud** button. Text-to-speech uses a separately deployed
Kokoro-FastAPI service exposing the OpenAI-compatible `POST /v1/audio/speech` endpoint. The URL is
used by the Next.js server and must be reachable from that server, not from the patient's browser.
When Kokoro is unavailable, chat replies still appear and can be retried later; generated audio is
not stored by the app. See the [clinic guide](docs/EXTERNAL_CLIENT_GUIDE.md#optional-kokoro-text-to-speech-service)
for setup details.

### 2b. Admin Console Setup (production)

Provider credentials can be managed from `/admin` instead of environment variables.
Generate the deployment secrets once and keep them outside the repository:

```bash
bun run hash:admin-password "choose-a-strong-password"   # -> ADMIN_PASSWORD_HASH
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # SETTINGS_ENCRYPTION_KEY
bun run db:migrate
```

Then open [http://localhost:3000/admin](http://localhost:3000/admin). Stored credentials are
write-only: the API returns only configured status, and the eye toggle reveals only the value
currently being typed. Environment variables remain a bootstrap fallback for any credential not
entered in the admin console.

For Google Calendar, either paste the **Service Account Email** and **Service Account Private Key**
from your key JSON, or the delegated Client ID / Client Secret / Refresh Token. Service-account auth
takes precedence when both are present. A service account only sees calendars explicitly shared with
its email, so share each dentist calendar with it first.

To bootstrap the service-account credentials from a key file instead of the UI:

```bash
bun run import:google-service-account path/to/service-account.json
```

### 3. Running Locally

```bash
# Start development server with Turbopack
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to experience the clinical portal.

#### Running voice against a local speech-to-speech model

Voice does not have to touch a cloud vendor. Any server that speaks the OpenAI Realtime GA protocol
over WebSocket can back the widget. The reference option is
[huggingface/speech-to-speech](https://github.com/huggingface/speech-to-speech) — an open pipeline
(Silero VAD → Parakeet TDT → Qwen3.5 → Qwen3-TTS) that runs entirely on your own machine. Any
equivalent self-hosted stack works the same way.

1. Start the server. For the Hugging Face pipeline:

   ```bash
   python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1
   pip install speech-to-speech
   speech-to-speech serve --host 127.0.0.1 --port 8765
   ```

   It speaks the OpenAI Realtime protocol at `ws://127.0.0.1:8765/v1/realtime`. On NVIDIA hardware
   budget about 16 GB of VRAM; `speech-to-speech local` starts server and microphone client together
   if you want to sanity-check the pipeline before pointing this app at it.
2. Empty `GEMINI_API_KEY` in `.env.local` (it wins when set) and keep only:

   ```env
   OPENAI_COMPATIBLE_VOICE_URL="ws://127.0.0.1:8765/v1/realtime"
   OPENAI_COMPATIBLE_VOICE_MODEL="gpt-realtime"
   ```

3. Reload the page and start a call.

Things to know while testing locally:

- The loopback URL is reachable only from the machine running the browser. Point
  `OPENAI_COMPATIBLE_VOICE_URL` at a LAN or tunnel address to test from a phone.
- A local server typically allows **one** concurrent session; a second call is rejected with
  "Voice provider has no free session slots".
- Voice activity detection ignores tones and sine waves. Test with real speech through a real
  microphone, not with a generated beep.
- Some local servers want reasoning disabled on the LLM (e.g. `reasoning_effort: "none"`) or replies
  take seconds per turn. That is a server setting, not an app setting.

---

## 🧪 Testing & Quality Gates

The project strictly follows the tooling standards pinned in project instructions:

```bash
# 1. Format code (Oxfmt)
bun run format

# 2. Typecheck (Bun check - zero TypeScript errors)
bun run check

# 3. Lint code (Oxlint - zero warnings)
bun run lint

# 4. Unit & Integration Test Suite
bun test

# 5. Playwright End-to-End Tests (starts a disposable PostgreSQL container; Docker required)
bun run test:e2e

# 6. Next.js Production Build
bun run build
```

---

## 💰 Production Cost Analysis

Cost depends entirely on which providers you run.

| Component | Cost driver |
| :--- | :--- |
| **Realtime Voice AI** | Typically the dominant cost when using a hosted provider (per audio-minute in and out). Running a local speech-to-speech model removes this line item, leaving only electricity and your own GPU. |
| **Text Chat LLM** | Per-token input/output on the configured model. |
| **Application Hosting** | Serverless plan or container per the chosen platform. |
| **Managed Database** | PostgreSQL instance with automated backups. |
| **Calendar APIs** | Google Calendar and Microsoft Graph both have free quotas that comfortably cover a single clinic. |

No monthly figure is quoted here on purpose: the voice line dominates any estimate, and it swings
from a per-minute provider bill to zero once you deploy a local model. Price the deployment against
the providers you actually configure. The historical per-minute model, with its assumptions stated
explicitly, is kept in [docs/INTERNAL_ARCHITECTURE_AND_COST.md](docs/INTERNAL_ARCHITECTURE_AND_COST.md)
for reference.

---

## 📚 Project Documentation

* [docs/PLAN.md](docs/PLAN.md) — 7-Day Implementation Roadmap and requirements breakdown.
* [docs/INTERNAL_ARCHITECTURE_AND_COST.md](docs/INTERNAL_ARCHITECTURE_AND_COST.md) — System architecture, Mermaid diagrams, financial analysis, and security decisions.
* [docs/EXTERNAL_CLIENT_GUIDE.md](docs/EXTERNAL_CLIENT_GUIDE.md) — Non-technical practice manager guide, Google/Outlook connection steps, and FAQ.
* [docs/CALENDAR_SETUP.md](docs/CALENDAR_SETUP.md) — Cloud OAuth setup for Google Cloud Platform and Microsoft Entra ID.

---

## ⚖️ License

MIT License. Designed and engineered for BrightSmile Dental Clinic.
