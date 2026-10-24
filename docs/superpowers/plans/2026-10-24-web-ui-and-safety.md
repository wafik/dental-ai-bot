# Web UI, Safety, and Live Dashboard (Day 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the customer-facing Web UI (Chat Widget, Voice Call Widget, Dentist Schedule Preview, Service Catalog), Safety Guardrails (Prompt-Injection Defense, Rate Limiter, Confirmation Flow), and API route handlers with full TDD.

**Architecture:** Safety modules in `src/safety/`, API route handlers in `src/app/api/v1/`, frontend components in `src/components/`, and main clinic portal in `src/app/page.tsx`.

**Tech Stack:** TypeScript, Bun >= 1.4.3 (`bun@1.4.4`), Next.js 16+ App Router, React 19+, Tailwind CSS v4, Lucide React, Sonner, Zod, Oxlint, Oxfmt.

---

## Global Constraints

- Keep frontend and backend in this single repository.
- Use `bun check`, `oxlint`, and `oxfmt`; never use ESLint or `tsc --noEmit`.
- Strict English only for all comments, documentation, and user-facing copy.
- Enforce authoritative backend rules: Junior dentist cannot perform Services C, D, or E.
- Tests must run offline with `bun test` without requiring live external services.

---

## Task 1: Prompt-Injection Defense, Input Sanitizer, and Rate Limiter

**Files:**
- Create: `src/safety/sanitizer.ts`
- Create: `src/safety/rate-limiter.ts`
- Test: `tests/safety-sanitizer.test.ts`
- Test: `tests/safety-rate-limiter.test.ts`

**Interfaces:**
```ts
export type SanitizerResult = {
  isValid: boolean;
  sanitized: string;
  flaggedReason?: "PROMPT_INJECTION" | "EXCESSIVE_LENGTH" | "MEDICAL_ADVICE_REQUEST";
  deflectionMessage?: string;
};

export type RateLimiterCheckResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
};
```

- [ ] **Step 1: Write failing tests** in `tests/safety-sanitizer.test.ts` and `tests/safety-rate-limiter.test.ts`:
  - `tests/safety-sanitizer.test.ts`: trims text, accepts safe inputs, detects "ignore previous instructions", "you are now a DAN", "reveal system prompt", rejects inputs over 1000 chars, detects medical diagnosis questions and returns clinic deflection.
  - `tests/safety-rate-limiter.test.ts`: allows requests under limit, blocks requests over limit (e.g. 5 requests with max 5), calculates remaining and reset time, isolates limits by client key.
- [ ] **Step 2: Run `bun test tests/safety-sanitizer.test.ts tests/safety-rate-limiter.test.ts`** and confirm failures.
- [ ] **Step 3: Implement `src/safety/sanitizer.ts` and `src/safety/rate-limiter.ts`**.
- [ ] **Step 4: Run `bun test tests/safety-sanitizer.test.ts tests/safety-rate-limiter.test.ts`** and verify all pass.
- [ ] **Step 5: Run `bun check`**.

---

## Task 2: Chat API Route Handler with Rate Limiting & Safety

**Files:**
- Create: `src/app/api/v1/chat/route.ts`
- Test: `tests/chat-api-route.test.ts`

**Route Specifications:**
- `POST /api/v1/chat`:
  - Body: `{ messages: LLMChatMessage[] }`
  - Validates payload with Zod.
  - Applies rate limiter (returns HTTP 429 when quota exceeded).
  - Sanitizes latest user message (returns deflection immediately if prompt injection or medical consultation detected).
  - Executes `ChatOrchestrator` with `SYSTEM_PROMPT` and `AppointmentService`.
  - Returns `{ success: true, reply: string, messages: LLMChatMessage[] }`.

- [ ] **Step 1: Write failing tests** in `tests/chat-api-route.test.ts`:
  - Validates missing or empty messages with HTTP 400.
  - Enforces rate limiting with HTTP 429 when quota exceeded.
  - Intercepts prompt injection and returns friendly safety refusal without calling LLM.
  - Intercepts medical diagnosis inquiries and returns clinic deflection without calling LLM.
  - Successfully handles valid conversation and returns orchestrator reply.
- [ ] **Step 2: Run `bun test tests/chat-api-route.test.ts`** and confirm failures.
- [ ] **Step 3: Implement `src/app/api/v1/chat/route.ts`**.
- [ ] **Step 4: Run `bun test tests/chat-api-route.test.ts`** and verify all pass.
- [ ] **Step 5: Run `bun check`**.

---

## Task 3: Appointments Dashboard API Route Handler

**Files:**
- Create: `src/app/api/v1/appointments/route.ts`
- Test: `tests/appointments-api-route.test.ts`

**Route Specifications:**
- `GET /api/v1/appointments?date=YYYY-MM-DD`:
  - Returns all confirmed appointments for the given date across Junior, Senior 1, and Senior 2.
  - Returns dentist availability summary and slot statuses.
- `POST /api/v1/appointments`:
  - Direct booking endpoint requiring patient details and slot info.
  - Validates with Zod schema.
  - Dispatches to `AppointmentService.bookAppointment()`.

- [ ] **Step 1: Write failing tests** in `tests/appointments-api-route.test.ts`:
  - `GET /api/v1/appointments`: requires valid YYYY-MM-DD date query param.
  - `GET /api/v1/appointments`: returns appointments and dentist availability summary.
  - `POST /api/v1/appointments`: rejects invalid phone or missing fields with HTTP 400.
  - `POST /api/v1/appointments`: rejects Junior dentist booking for Service C with 400/422.
  - `POST /api/v1/appointments`: successfully creates appointment with Senior 1.
- [ ] **Step 2: Run `bun test tests/appointments-api-route.test.ts`** and confirm failures.
- [ ] **Step 3: Implement `src/app/api/v1/appointments/route.ts`**.
- [ ] **Step 4: Run `bun test tests/appointments-api-route.test.ts`** and verify all pass.
- [ ] **Step 5: Run `bun check`**.

---

## Task 4: Interactive Web UI Components & Clinic Portal

**Files:**
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/chat-widget.tsx`
- Create: `src/components/voice-call-widget.tsx`
- Create: `src/components/schedule-preview.tsx`
- Create: `src/components/services-catalog.tsx`
- Modify: `src/app/page.tsx`
- Test: `tests/ui-components.test.ts`

- [ ] **Step 1: Create UI primitives (`badge.tsx`, `input.tsx`)**.
- [ ] **Step 2: Create feature components (`chat-widget.tsx`, `voice-call-widget.tsx`, `schedule-preview.tsx`, `services-catalog.tsx`)**.
- [ ] **Step 3: Build the main unified portal in `src/app/page.tsx` with responsive navigation tabs, live status, and toast notifications**.
- [ ] **Step 4: Write unit tests in `tests/ui-components.test.ts` asserting component exports, initial state, and markup integrity**.
- [ ] **Step 5: Run `bun test tests/ui-components.test.ts`** and verify all pass.
- [ ] **Step 6: Run `bun check`**.

---

## Task 5: Full verification, documentation, commit, push, PR and merge

**Files:**
- Modify: `docs/PLAN.md` (Update Day 5 items to completed)
- Modify: `README.md` (Update Day 5 UI and Safety overview)

- [ ] **Step 1: Run `bun run format`** to format all code.
- [ ] **Step 2: Run `bun check`** to verify type cleanliness across the entire repo.
- [ ] **Step 3: Run `bun run lint`** to verify Oxlint passes with 0 warnings/errors.
- [ ] **Step 4: Run `bun test`** to ensure all test suites pass.
- [ ] **Step 5: Run `bun run build`** to ensure Next.js builds cleanly.
- [ ] **Step 6: Update `docs/PLAN.md` and `README.md`**.
- [ ] **Step 7: Commit and push** changes to git branch `feat/day-5-web-ui-and-safety`.
- [ ] **Step 8: Open Pull Request to `main` and merge into `main`**.
