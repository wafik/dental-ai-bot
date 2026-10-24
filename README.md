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
