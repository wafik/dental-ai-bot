# Chat AI, Tool Calling, and Appointment Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Day 3 conversational AI layer with provider-neutral LLM contract, OpenAI adapter, 4 appointment tools, PostgreSQL Drizzle persistence with in-memory repository for tests, authoritative backend validation in `AppointmentService`, strict English system prompt guardrails, and multi-turn chat orchestrator.

**Architecture:** Provider-neutral `LLMProvider` contract in `src/providers/ai/`, PostgreSQL schema and repository in `src/repository/`, domain models in `src/domain/appointment.ts`, business orchestration in `src/services/appointment-service.ts`, tool schemas in `src/services/appointment-tools.ts`, system prompt in `src/safety/system-prompt.ts`, and multi-turn conversational loop in `src/services/chat-orchestrator.ts`. All external HTTP calls are mocked in unit tests.

**Tech Stack:** TypeScript, Bun >= 1.4.3 (`bun@1.4.4`), Drizzle ORM (`drizzle-orm` + `postgres`), Next.js App Router, native `fetch`, Oxlint, Oxfmt.

## Global Constraints

- Use one repository for frontend and backend; keep the API delivery layer, domain logic, integrations, tests, and documentation in this repository.
- Use `bun check`, `oxlint`, and `oxfmt`; never use ESLint or `tsc --noEmit`.
- Keep HTTP handling thin and put business rules in domain/services modules.
- Enforce dentist qualifications authoritatively in `AppointmentService`: Junior dentist cannot perform Services C, D, or E.
- Enforce clinic working hours (09:00 to 17:00) and 30-minute slot alignment authoritatively in `AppointmentService`.
- All code comments, docstrings, inline notes, commit messages, and documentation must be written in English.
- Tests must run offline with `bun test` without requiring a running PostgreSQL server or live external APIs.
- Preserve unrelated existing working-tree changes; do not stage or modify `.claude-flow/` or `.claude/` hook state.

---

## Task 1: Domain models, error classes, and repository contracts

**Files:**
- Create: `src/domain/appointment.ts`
- Create: `src/repository/schema.ts`
- Create: `src/repository/appointment-repository.ts`
- Create: `src/repository/in-memory-appointment-repository.ts`
- Create: `src/repository/drizzle-appointment-repository.ts`
- Test: `tests/appointment-repository.test.ts`

**Interfaces:**
```ts
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
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
};

export type AppointmentFilter = {
  dentistId?: string;
  date?: string;
  status?: AppointmentStatus;
};

export type AppointmentRepository = {
  create(record: AppointmentRecord): Promise<AppointmentRecord>;
  findById(id: string): Promise<AppointmentRecord | null>;
  find(filter: AppointmentFilter): Promise<AppointmentRecord[]>;
  updateStatus(id: string, status: AppointmentStatus, cancelledAt?: string): Promise<AppointmentRecord>;
};
```

- [x] **Step 1: Write failing tests** in `tests/appointment-repository.test.ts` for `InMemoryAppointmentRepository`: creating an appointment, finding by ID, filtering by dentist/date/status, updating status to cancelled, and error handling when updating a non-existent appointment.
- [x] **Step 2: Run `bun test tests/appointment-repository.test.ts`** and confirm failures due to missing implementations.
- [x] **Step 3: Implement domain types, error classes, Drizzle schema, repository contract, and implementations**:
  - `src/domain/appointment.ts`: Domain models and custom error classes (`DentistQualificationError`, `SlotUnavailableError`, `AppointmentNotFoundError`).
  - `src/repository/schema.ts`: Drizzle PostgreSQL table definition.
  - `src/repository/appointment-repository.ts`: Repository interface and filter types.
  - `src/repository/in-memory-appointment-repository.ts`: In-memory implementation with a Map.
  - `src/repository/drizzle-appointment-repository.ts`: Drizzle PostgreSQL implementation.
- [x] **Step 4: Run `bun test tests/appointment-repository.test.ts`** and verify all tests pass.
- [x] **Step 5: Run `bun check`** to verify zero type errors.

---

## Task 2: Provider-neutral LLM contract, configuration, and OpenAI adapter

**Files:**
- Create: `src/providers/ai/llm-provider.ts`
- Create: `src/config/ai.ts`
- Create: `src/providers/ai/openai-chat-adapter.ts`
- Test: `tests/openai-chat-adapter.test.ts`

**Interfaces:**
```ts
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
```

- [x] **Step 1: Write failing mocked-fetch tests** in `tests/openai-chat-adapter.test.ts`:
  - Plain text completion parsing.
  - Function tool-calling parsing (`tool_calls` with JSON arguments).
  - Serializing tool output messages (`role: "tool"`, `toolCallId`).
  - HTTP 401 Unauthorized handling -> throws `LLMProviderError` without leaking API key.
  - HTTP 429 Rate Limited handling -> throws `LLMProviderError` with status 429.
  - Network failure handling -> throws `LLMProviderError`.
- [x] **Step 2: Run `bun test tests/openai-chat-adapter.test.ts`** and confirm failures.
- [x] **Step 3: Implement `LLMProvider` contract, `src/config/ai.ts`, and `OpenAIChatAdapter`**:
  - `src/providers/ai/llm-provider.ts`: Types, interfaces, and `LLMProviderError`.
  - `src/config/ai.ts`: Configuration getter reading `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`.
  - `src/providers/ai/openai-chat-adapter.ts`: Fetch-based adapter formatting requests and parsing OpenAI chat completion JSON.
- [x] **Step 4: Run `bun test tests/openai-chat-adapter.test.ts`** and verify all pass.
- [x] **Step 5: Run `bun check`** to verify type cleanliness.

---

## Task 3: Appointment service with backend validation and calendar sync

**Files:**
- Create: `src/utils/timezone.ts`
- Create: `src/services/appointment-service.ts`
- Test: `tests/appointment-service.test.ts`

**Interfaces:**
- `localToUtcIso(dateStr, timeStr, timeZone)`: Converts local date & time to RFC3339 UTC ISO.
- `utcToLocalAppointment(busy, dentistId, targetDate, timeZone)`: Converts external calendar busy intervals to local clinic appointments.
- `AppointmentService`:
  - `getAvailableSlots(input: { serviceCode, date, dentistId? })`: Queries repository and calendar provider, runs `findAvailableSlots`.
  - `bookAppointment(input: BookAppointmentInput)`: Enforces dentist qualification (rejects Junior for C, D, E), validates working hours (09:00 - 17:00), checks 30-min boundary, verifies slot availability, calls `calendarProvider.createEvent`, and stores record in repository.
  - `cancelAppointment(input: CancelAppointmentInput)`: Updates status to `cancelled` and marks `cancelledAt`.

- [x] **Step 1: Write failing tests** in `tests/appointment-service.test.ts`:
  - Rejects booking Service C, D, or E with Junior dentist, throwing `DentistQualificationError`.
  - Allows booking Service A and B with Junior dentist.
  - Allows booking Services A, B, C, D, and E with Senior 1 and Senior 2.
  - Rejects booking times before clinic opening (`08:30 < 09:00`).
  - Rejects booking durations extending past clinic closing (e.g. Service E 360m starting at 12:00 ends at 18:00 > 17:00).
  - Rejects non-30-minute aligned start times (e.g. 09:15).
  - Rejects overlapping bookings when a conflicting appointment exists in repository.
  - Rejects overlapping bookings when external calendar returns a busy interval.
  - Successfully books appointment, creates calendar event, and saves to repository.
  - Successfully cancels appointment and handles duplicate cancellation idempotently.
- [x] **Step 2: Run `bun test tests/appointment-service.test.ts`** and confirm failures.
- [x] **Step 3: Implement timezone utility and `AppointmentService`**:
  - `src/utils/timezone.ts`: Date math converting between clinic local time and canonical UTC strings.
  - `src/services/appointment-service.ts`: Core business logic with validation and sync.
- [x] **Step 4: Run `bun test tests/appointment-service.test.ts`** and verify all pass.
- [x] **Step 5: Run `bun check`**.

---

## Task 4: The 4 appointment tools and execution dispatcher

**Files:**
- Create: `src/services/appointment-tools.ts`
- Test: `tests/appointment-tools.test.ts`

**Interfaces:**
- `APPOINTMENT_TOOL_DEFINITIONS`: Array of 4 `LLMToolDefinition`:
  1. `list_services`: No parameters. Returns catalog of services with duration & eligible dentists.
  2. `check_availability`: Parameters `serviceCode`, `date`, optional `dentistId`.
  3. `book_appointment`: Parameters `serviceCode`, `dentistId`, `date`, `startTime`, `patientName`, `patientPhone`.
  4. `cancel_appointment`: Parameters `appointmentId`.
- `executeAppointmentTool(service, name, args)`: Executes the tool against `AppointmentService` and returns a JSON-serializable string.

- [x] **Step 1: Write failing tests** in `tests/appointment-tools.test.ts`:
  - Validates JSON schema of all 4 tool definitions.
  - Tests execution of `list_services`.
  - Tests execution of `check_availability` with qualified vs unqualified dentists.
  - Tests execution of `book_appointment` on success and on validation failure.
  - Tests execution of `cancel_appointment` with valid ID and non-existent ID.
  - Tests unknown tool name returns error string.
- [x] **Step 2: Run `bun test tests/appointment-tools.test.ts`** and confirm failures.
- [x] **Step 3: Implement `src/services/appointment-tools.ts`**.
- [x] **Step 4: Run `bun test tests/appointment-tools.test.ts`** and verify all pass.
- [x] **Step 5: Run `bun check`**.

---

## Task 5: System prompt guardrails and conversational chat orchestrator

**Files:**
- Create: `src/safety/system-prompt.ts`
- Create: `src/services/chat-orchestrator.ts`
- Test: `tests/system-prompt-guardrails.test.ts`
- Test: `tests/chat-orchestrator.test.ts`

**Interfaces:**
- `SYSTEM_PROMPT`: English system prompt containing dentist constraints, service list, clinic hours, medical advice disclaimers, out-of-scope deflection, and tool usage discipline.
- `ChatOrchestrator`:
  - Takes `llmProvider`, `appointmentService`, and optional system prompt.
  - `handleUserMessage(messages: LLMChatMessage[]): Promise<{ reply: string; messages: LLMChatMessage[] }>`
  - Executes tool loop until model stops, up to `maxIterations = 5`.

- [x] **Step 1: Write failing tests**:
  - `tests/system-prompt-guardrails.test.ts`: Asserts presence of clinic hours, all 5 services, 3 dentists, Junior qualification restrictions, medical advice deflection, emergency care disclaimer, and tool discipline.
  - `tests/chat-orchestrator.test.ts`:
    - Handles direct conversational answer without tool calling.
    - Executes single tool call (`list_services`), feeds result back to LLM, returns final answer.
    - Handles multi-turn tool calling sequence (`check_availability` -> `book_appointment`).
    - Enforces iteration limit guard against runaway recursive tool calls.
- [x] **Step 2: Run `bun test tests/system-prompt-guardrails.test.ts tests/chat-orchestrator.test.ts`** and confirm failures.
- [x] **Step 3: Implement `src/safety/system-prompt.ts` and `src/services/chat-orchestrator.ts`**.
- [x] **Step 4: Run `bun test tests/system-prompt-guardrails.test.ts tests/chat-orchestrator.test.ts`** and verify all pass.
- [x] **Step 5: Run `bun check`**.

---

## Task 6: Full verification, documentation, commit and push

**Files:**
- Modify: `docs/PLAN.md` (Update Day 3 checklist items to completed)
- Modify: `README.md` (Update Day 3 architecture references)
- Modify: `.env.example` (Add `OPENAI_API_KEY`, `OPENAI_MODEL`, `DATABASE_URL`)

- [x] **Step 1: Run `bun run format`** to format all code.
- [x] **Step 2: Run `bun check`** to verify type cleanliness across the entire repo.
- [x] **Step 3: Run `bun run lint`** to verify Oxlint passes with 0 warnings/errors.
- [x] **Step 4: Run `bun test`** to ensure all test suites pass.
- [x] **Step 5: Run `bun run build`** to ensure Next.js builds cleanly.
- [x] **Step 6: Update `docs/PLAN.md` and `README.md`**.
- [x] **Step 7: Commit and push** changes to git as requested by user.
