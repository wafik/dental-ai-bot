# Day 3 Design Specification: Chat AI, Tool Calling, and Appointment Guardrails

**Date:** 2026-10-24  
**Status:** Approved  
**Scope:** Day 3 of 7-Day Dental Clinic Conversational AI Appointment Bot  

---

## 1. Executive Summary & Goals

Day 3 establishes the conversational intelligence and appointment orchestration layer for the BrightSmile Clinic Assistant:
1. **Provider-Agnostic AI Layer**: A generic `LLMProvider` contract supporting multi-turn chat and function tool calling, implemented via a native `fetch`-based `OpenAIChatAdapter` without heavy SDKs.
2. **Authoritative Backend Validation**: All business invariants (working hours 09:00–17:00, 30-minute slot alignment, non-overlapping schedules, and strict dentist qualifications where Junior is barred from Services C, D, and E) are enforced in `AppointmentService`. Prompt instructions guide the model, but server-side code is authoritative.
3. **Appointment Persistence**: PostgreSQL integration via Drizzle ORM (`drizzle-orm` + `postgres`), abstracted behind an `AppointmentRepository` interface with an `InMemoryAppointmentRepository` for offline, instantaneous test execution (`bun test`).
4. **Calendar Synchronization**: Automated creation of events in Google Calendar or Microsoft Outlook via the `CalendarProvider` contract established on Day 2, converting clinic local time (`Asia/Jakarta`) to RFC3339 UTC timestamps.
5. **Conversational Guardrails & Prompting**: Strict English system prompt enforcing clinic boundaries, deflecting out-of-scope queries (medical advice, prescriptions, general chat), and preventing hallucinated availability.

---

## 2. System Architecture & Component Diagram

```
                                      ┌─────────────────────────────────┐
                                      │        User / Client Chat       │
                                      └────────────────┬────────────────┘
                                                       │
                                                       ▼
                                      ┌─────────────────────────────────┐
                                      │        ChatOrchestrator         │
                                      │  - Multi-turn tool call loop    │
                                      │  - Iteration safety limit (<=5) │
                                      └───────┬─────────────────┬───────┘
                                              │                 │
                      ┌───────────────────────┘                 └───────────────────────┐
                      ▼                                                                 ▼
      ┌──────────────────────────────┐                                  ┌──────────────────────────────┐
      │         LLMProvider          │                                  │       AppointmentTools       │
      │  (Contract & OpenAI Adapter) │                                  │  - list_services             │
      │  - Sanitized error types     │                                  │  - check_availability        │
      │  - Zero external SDKs        │                                  │  - book_appointment          │
      └──────────────┬───────────────┘                                  │  - cancel_appointment        │
                     │                                                  └──────────────┬───────────────┘
                     ▼                                                                 │
         OpenAI / Groq / Ollama                                                        ▼
                                                                        ┌──────────────────────────────┐
                                                                        │      AppointmentService      │
                                                                        │  - Dentist qualification rule│
                                                                        │  - Working hours 09:00-17:00 │
                                                                        │  - Slot grid & collision check│
                                                                        └───────┬──────────────┬───────┘
                                                                                │              │
                                         ┌──────────────────────────────────────┘              └──────────────────────────────────────┐
                                         ▼                                                                                            ▼
                         ┌──────────────────────────────┐                                                             ┌──────────────────────────────┐
                         │    AppointmentRepository     │                                                             │       CalendarProvider       │
                         │  - Drizzle Postgres (Prod)   │                                                             │  - GoogleCalendarAdapter     │
                         │  - InMemory (Unit Tests)     │                                                             │  - OutlookCalendarAdapter    │
                         └──────────────────────────────┘                                                             └──────────────────────────────┘
```

---

## 3. Domain Models & Error Types

Located in `src/domain/appointment.ts`:

```typescript
import type { DentalService } from "./clinic";

export type AppointmentStatus = "confirmed" | "cancelled";

export type AppointmentRecord = {
  id: string;
  patientName: string;
  patientPhone: string;
  serviceCode: DentalService["code"];
  dentistId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: AppointmentStatus;
  calendarEventId?: string;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
  cancelledAt?: string; // ISO 8601 UTC
};

export type BookAppointmentInput = {
  patientName: string;
  patientPhone: string;
  serviceCode: DentalService["code"];
  dentistId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
};

export type CancelAppointmentInput = {
  appointmentId: string;
  reason?: string;
};

export class AppointmentError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "AppointmentError";
    this.code = code;
  }
}

export class DentistQualificationError extends AppointmentError {
  constructor(dentistId: string, serviceCode: string) {
    super(
      `Dentist '${dentistId}' is not qualified to perform Service ${serviceCode}.`,
      "DENTIST_NOT_QUALIFIED",
    );
  }
}

export class SlotUnavailableError extends AppointmentError {
  constructor(message: string) {
    super(message, "SLOT_UNAVAILABLE");
  }
}

export class AppointmentNotFoundError extends AppointmentError {
  constructor(id: string) {
    super(`Appointment with ID '${id}' was not found.`, "APPOINTMENT_NOT_FOUND");
  }
}
```

---

## 4. PostgreSQL Schema & Drizzle ORM

### Schema Definition (`src/repository/schema.ts`)
```typescript
import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const appointments = pgTable("appointments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  patientName: text("patient_name").notNull(),
  patientPhone: varchar("patient_phone", { length: 32 }).notNull(),
  serviceCode: varchar("service_code", { length: 8 }).notNull(),
  dentistId: varchar("dentist_id", { length: 32 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  startTime: varchar("start_time", { length: 5 }).notNull(), // HH:mm
  endTime: varchar("end_time", { length: 5 }).notNull(), // HH:mm
  status: varchar("status", { length: 16 }).notNull().default("confirmed"),
  calendarEventId: text("calendar_event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
});
```

### Repository Contract (`src/repository/appointment-repository.ts`)
```typescript
export type AppointmentFilter = {
  dentistId?: string;
  date?: string;
  status?: "confirmed" | "cancelled";
};

export type AppointmentRepository = {
  create(record: AppointmentRecord): Promise<AppointmentRecord>;
  findById(id: string): Promise<AppointmentRecord | null>;
  find(filter: AppointmentFilter): Promise<AppointmentRecord[]>;
  updateStatus(id: string, status: "confirmed" | "cancelled", cancelledAt?: string): Promise<AppointmentRecord>;
};
```

1. **`DrizzleAppointmentRepository`**: Connects via `drizzle-orm/postgres-js` when `DATABASE_URL` is set in production.
2. **`InMemoryAppointmentRepository`**: Synchronous atomic storage using an internal `Map<string, AppointmentRecord>`. Ensures 100% test independence and rapid execution without requiring a local Postgres database to run `bun test`.

---

## 5. Provider-Neutral `LLMProvider` Contract & `OpenAIChatAdapter`

### Generic Contract (`src/providers/ai/llm-provider.ts`)
```typescript
export type LLMRole = "system" | "user" | "assistant" | "tool";

export type LLMToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type LLMChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: LLMToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type LLMToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type LLMChatRequest = {
  messages: LLMChatMessage[];
  tools?: LLMToolDefinition[];
  temperature?: number;
  maxTokens?: number;
};

export type LLMChatResponse = {
  message: {
    role: "assistant";
    content: string | null;
    toolCalls?: LLMToolCall[];
  };
  finishReason: "stop" | "tool_calls" | "length" | "error";
};

export type LLMProvider = {
  chat(request: LLMChatRequest): Promise<LLMChatResponse>;
};

export class LLMProviderError extends Error {
  readonly provider: string;
  readonly operation: string;
  readonly status?: number;

  constructor(options: {
    message: string;
    provider: string;
    operation: string;
    status?: number;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "LLMProviderError";
    this.provider = options.provider;
    this.operation = options.operation;
    this.status = options.status;
  }
}
```

### Adapter (`src/providers/ai/openai-chat-adapter.ts`)
- Configured via `src/config/ai.ts` (`OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, optional `OPENAI_MODEL`).
- Uses native `fetch` with dependency injection (`fetchFn = globalThis.fetch`) for mocked testing.
- Formats messages and tools to standard OpenAI chat completion payloads.
- Safely decodes `tool_calls` arguments; wraps network or API status errors in `LLMProviderError` without leaking API keys.

---

## 6. Appointment Service & Business Rules

Located in `src/services/appointment-service.ts`:

### Core Enforcements
1. **Dentist Qualification Rule**:
   - `SERVICES` specifies eligible dentists per service:
     - Service A & B: Junior, Senior 1, Senior 2.
     - Service C, D & E: Senior 1, Senior 2 only.
   - If `!service.eligibleDentistIds.includes(input.dentistId)`, throw `DentistQualificationError`.
2. **Clinic Hours (09:00 - 17:00)**:
   - Appointments must start on or after `09:00`.
   - Start time must be on a 30-minute boundary (`minutes % 30 === 0`).
   - Calculated `endTime = toTime(toMinutes(startTime) + service.durationMinutes)`.
   - `endTime` must be on or before `17:00`.
3. **Collision Detection & Calendar Sync**:
   - Queries `repository.find({ date, status: "confirmed" })` for internal busy periods.
   - Queries `calendarProvider.getBusyIntervals` for external busy periods, converting local clinic day start/end into UTC ISO strings.
   - Computes open slots using `findAvailableSlots` from `src/domain/scheduling.ts`.
   - If requested slot collides with existing appointments or calendar events, throws `SlotUnavailableError`.
   - On booking, converts local start/end to RFC3339 UTC ISO strings and invokes `calendarProvider.createEvent`.
   - Persists confirmed appointment record in `AppointmentRepository`.

---

## 7. Tool Definitions & Execution Bridge

Located in `src/services/appointment-tools.ts`:

### The 4 Tools:
1. `list_services`: Returns all 5 dental services, durations, and eligible dentists.
2. `check_availability`: Takes `serviceCode`, `date` (YYYY-MM-DD), and optional `dentistId`. If Junior is requested for C, D, or E, immediately returns qualification failure. Otherwise returns available time slots.
3. `book_appointment`: Takes `serviceCode`, `dentistId`, `date`, `startTime`, `patientName`, `patientPhone`. Invokes `AppointmentService.bookAppointment`. Returns success receipt or structured validation error.
4. `cancel_appointment`: Takes `appointmentId`. Invokes `AppointmentService.cancelAppointment`. Returns success confirmation or not-found error.

---

## 8. System Prompt & Conversational Guardrails

Located in `src/safety/system-prompt.ts`:

### Prompt Requirements:
- Identity: Virtual receptionist for BrightSmile Clinic.
- 3 Dentists: Junior, Senior 1, Senior 2.
- 5 Services: A (60m), B (60m), C (150m), D (120m), E (360m).
- Clinic hours: Mon-Sat 09:00 to 17:00.
- Junior dentist constraint: Can only perform Service A and B. Explicitly decline Junior for C, D, or E and suggest Senior 1 or Senior 2.
- Scope limitations: Strictly decline medical diagnosis, prescriptions, emergency handling, and non-dental inquiries. Provide safety disclaimer for severe pain/swelling and advise seeking emergency medical attention.
- Tool discipline: Never invent available slots; always call `check_availability`. Require full patient details before booking.
- Language: English only, polite and concise.

---

## 9. Chat Orchestrator & Conversational Loop

Located in `src/services/chat-orchestrator.ts`:
- Accepts conversation message history and system prompt.
- Binds tool definitions to the LLM request.
- Manages multi-turn tool-calling loop:
  1. Calls `llmProvider.chat`.
  2. If the assistant returns `toolCalls`, dispatches each tool call to `executeAppointmentTool`.
  3. Appends the tool results (`role: "tool"`) to the message history.
  4. Calls `llmProvider.chat` again until the model returns a final text response (`finishReason: "stop"`).
  5. Implements a maximum iteration safety guard (`maxIterations = 5`) to prevent runaway recursive tool loops.

---

## 10. Test Strategy & Verification Gates

All automated tests will run offline with `bun test`:
1. `tests/appointment-service.test.ts`: Unit tests for qualification enforcement, working hours, 30-min grid alignment, conflict detection, calendar event creation, and cancellations.
2. `tests/appointment-tools.test.ts`: Schema verification and tool execution testing.
3. `tests/system-prompt-guardrails.test.ts`: Content and rule assertions on system prompt text.
4. `tests/openai-chat-adapter.test.ts`: Mocked HTTP tests for text response, tool-call parsing, 401/429 error sanitization.
5. `tests/chat-orchestrator.test.ts`: End-to-end multi-turn conversation flow with tool execution.
6. Full quality gates: `bun run format`, `bun check`, `bun run lint`, `bun test`, `bun run build`.
