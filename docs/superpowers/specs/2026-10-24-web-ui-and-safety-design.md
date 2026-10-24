# Web UI, Safety, and Live Dashboard Design Specification

**Author:** Forward Deployment Engineer  
**Date:** 2026-10-24  
**Status:** Approved  
**Scope:** Day 5 — Web UI, Accessible Controls, Prompt-Injection Defense, Rate Limiter, Confirmation Flow, and Live Schedule Dashboard

---

## 1. Overview & Architecture

Day 5 delivers the customer-facing interface and enterprise safety layer for the BrightSmile Dental Clinic assistant. The application provides an integrated web workspace combining:

1. **Interactive Conversational AI**:
   - **Chat Interface**: Multi-turn text chat with message bubbles, tool execution status badges, service recommendation chips, and quick action buttons.
   - **Voice Call Interface**: Real-time WebRTC audio call interface with speech state pulse, mute/unmute control, live transcript waterfall, and end call button.
2. **Dentist Schedule Dashboard**:
   - Visual 3-dentist schedule preview (Junior, Senior 1, Senior 2) across 09:00–17:00.
   - Date picker to inspect booked vs. available time slots.
3. **Services Catalog Preview**:
   - Clear display of Services A through E with durations, eligible dentists, and descriptions.
4. **Safety & Guardrails Layer**:
   - **Prompt Injection Defense**: Detection of jailbreak triggers, system prompt leak attempts, and non-dental topic evasion.
   - **Rate Limiting**: Sliding window rate limiter guarding `/api/v1/chat`, `/api/v1/voice/session`, and `/api/v1/appointments`.
   - **Explicit User Confirmation**: Pre-booking confirmation dialog ensuring patients verify details before appointments are locked.

---

## 2. Safety Modules

### 2.1 Prompt Injection & Input Sanitizer (`src/safety/sanitizer.ts`)
- Sanitizes user input string: trims whitespace, normalizes Unicode, enforces 1,000 character length limit.
- Checks against known injection vectors (e.g. "ignore previous instructions", "you are now in developer mode", "system prompt", "DAN", etc.).
- Deflects medical advice requests with structured clinic disclaimer.

### 2.2 Rate Limiter (`src/safety/rate-limiter.ts`)
- In-memory sliding window rate limiter tracking client identifiers (IP address or session key).
- Default: 30 requests per minute per IP.
- Returns `remaining`, `resetTimeMs`, and `allowed: boolean`.
- Throws HTTP 429 when quota exceeded.

### 2.3 Explicit User Confirmation (`src/safety/confirmation.ts`)
- Model generates a proposed booking summary before executing irreversible state changes.
- Booking action requires explicit confirmation timestamp and verification.

---

## 3. API Endpoints

- `POST /api/v1/chat`:
  - Body: `{ messages: LLMChatMessage[] }`
  - Runs rate limiter and prompt injection sanitizer.
  - Invokes `ChatOrchestrator` connected to `AppointmentService`.
  - Returns `{ success: true, reply: string, messages: LLMChatMessage[] }`.
- `GET /api/v1/appointments`:
  - Query: `?date=YYYY-MM-DD`
  - Returns `{ success: true, date: string, appointments: AppointmentRecord[] }`.

---

## 4. UI Components

- `src/components/chat-widget.tsx`: Text chat component with message list, auto-scroll, loading state, quick service chips.
- `src/components/voice-call-widget.tsx`: Real-time WebRTC voice interface with pulse visualizer, timer, mute toggle, and transcript stream.
- `src/components/schedule-preview.tsx`: Live grid of Junior, Senior 1, and Senior 2 schedules.
- `src/components/services-catalog.tsx`: Service cards with eligibility badges and duration.
- `src/app/page.tsx`: Main unified responsive layout with header, navigation tabs, and toast feedback.
