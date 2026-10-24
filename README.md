# Dental Clinic Appointment Assistant

A single-repository Next.js application for an AI-driven dental clinic conversational appointment assistant.

## Requirements

- Bun >= 1.4.3 (current: `bun@1.4.4`)

## Development

```bash
bun install
bun run dev
```

## Checks & Quality Gates

```bash
bun check          # TypeScript check (via bun check, never tsc --noEmit)
bun run lint       # Code linting via Oxlint
bun run format     # Code formatting via Oxfmt
bun test           # Test suite (all unit, adapter, and contract tests)
bun run build      # Next.js build
```

## Calendar Integration (Day 2)

The application supports provider-neutral calendar synchronization with **Google Calendar** and **Microsoft Outlook (Microsoft Graph)**:

- **Shared Contract**: `src/providers/calendar/calendar-provider.ts` exposes `getBusyIntervals` and `createEvent`.
- **Google Adapter**: `src/providers/calendar/google-calendar-adapter.ts` (Google Calendar API v3).
- **Outlook Adapter**: `src/providers/calendar/outlook-calendar-adapter.ts` (Microsoft Graph REST).
- **Configuration**: `src/config/calendar.ts` reads delegated OAuth credentials and dentist calendar IDs from environment variables.
- **External Setup Guide**: See [docs/CALENDAR_SETUP.md](docs/CALENDAR_SETUP.md) for step-by-step instructions on setting up Google Cloud and Microsoft Entra ID.
- **Environment Template**: See `.env.example` for required configuration variables.

## Chat AI, Tool Calling & Persistence (Day 3)

The application provides conversational appointment management with strict server-side validation and multi-turn tool calling:

- **Provider-Neutral LLM Contract**: `src/providers/ai/llm-provider.ts` defines `LLMProvider`, `LLMChatMessage`, `LLMToolDefinition`, and `LLMProviderError` with zero-leak error masking.
- **OpenAI Adapter**: `src/providers/ai/openai-chat-adapter.ts` provides native `fetch`-based chat completions and tool-call execution without external SDKs.
- **Authoritative Validation & Scheduling**: `src/services/appointment-service.ts` enforces clinic working hours (09:00–17:00), 30-minute interval alignment, and strict dentist qualifications (Junior dentist cannot perform Services C, D, or E).
- **The 4 Appointment Tools**: `src/services/appointment-tools.ts` provides `list_services`, `check_availability`, `book_appointment`, and `cancel_appointment`.
- **Conversational Orchestrator**: `src/services/chat-orchestrator.ts` executes multi-turn tool loops with system prompt guardrails and a 5-iteration recursion safety cap.
- **System Prompt Guardrails**: `src/safety/system-prompt.ts` enforces clinic boundaries, emergency deflection, and declines medical diagnoses or general chat.
- **PostgreSQL & Drizzle ORM**: `src/repository/schema.ts`, `DrizzleAppointmentRepository` (production), and `InMemoryAppointmentRepository` (deterministic unit testing).

## Conversational Voice AI & WebRTC (Day 4)

The application supports real-time, two-way browser voice conversations using standard WebRTC with ephemeral session security:

- **Provider-Neutral Voice Contract**: `src/providers/voice/voice-provider.ts` defines `VoiceProvider`, `VoiceSessionConfig`, and `VoiceProviderError`.
- **OpenAI Realtime Adapter**: `src/providers/voice/openai-realtime-adapter.ts` initiates sessions with OpenAI Realtime API (`gpt-4o-realtime-preview`), configuring voice, `SYSTEM_PROMPT`, and `APPOINTMENT_TOOL_DEFINITIONS`.
- **Ephemeral Session Security**: `POST /api/v1/voice/session` issues temporary tokens (`client_secret`), ensuring production API keys are never exposed to browser clients.
- **Authoritative Voice Tool Calling**: `POST /api/v1/voice/tools` executes tool calls triggered by the voice model against `AppointmentService`, enforcing dentist qualification constraints and calendar sync.
- **Client-Side WebRTC Manager**: `src/features/voice/voice-session-manager.ts` and `src/features/voice/use-realtime-voice.ts` manage microphone input, WebRTC audio streams, and bidirectional DataChannel event dispatching.

## Web UI, Safety & Live Dashboard (Day 5)

The application provides an interactive web workspace combining text chat, WebRTC voice calling, live dentist schedules, and enterprise guardrails:

- **AI Text Chat Widget**: `src/components/chat-widget.tsx` with multi-turn messages, suggestion pills, and appointment confirmation indicators.
- **Conversational Voice Call Widget**: `src/components/voice-call-widget.tsx` featuring speech pulse visualizer, real-time transcription waterfall, and mute/unmute controls.
- **Dentist Schedules Dashboard**: `src/components/schedule-preview.tsx` displaying live 09:00–17:00 booked vs. available slots across Junior, Senior 1, and Senior 2.
- **Dental Services Catalog**: `src/components/services-catalog.tsx` highlighting durations and eligible dentist restrictions.
- **Prompt Injection Defense & Sanitizer**: `src/safety/sanitizer.ts` intercepts jailbreaks ("ignore previous instructions", "DAN", etc.) and deflects clinical medical diagnosis questions without consuming LLM tokens.
- **Sliding Window Rate Limiter**: `src/safety/rate-limiter.ts` guarding `/api/v1/chat` and API routes against quota exhaustion.
- **Appointments API**: `GET /api/v1/appointments` and `POST /api/v1/appointments` for dashboard sync and direct booking.


