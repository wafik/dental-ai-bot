# Conversational Voice AI Architecture & Realtime WebRTC Design Specification

**Author:** Forward Deployment Engineer  
**Date:** 2026-10-24  
**Status:** Approved  
**Scope:** Day 4 — Real-Time Conversational Voice AI with Ephemeral WebRTC & Authoritative Server-Side Tool Calling

---

## 1. Executive Summary & Business Context

The BrightSmile Dental Clinic assistant requires real-time conversational voice interaction—not static speech-to-text followed by separate text-to-speech. Patients speaking via browser microphone must experience low-latency, natural, two-way audio conversations with full turn-taking, interruption handling, and authoritative appointment booking.

Crucially, **spoken requests must adhere to the exact same business rules and calendar integrations as text chat**:
- Junior dentist cannot perform Services C, D, or E.
- Clinic working hours (09:00 to 17:00) and 30-minute interval alignment must be strictly enforced.
- Collision avoidance with internal appointments and Google/Outlook calendar events.
- Medical advice deflection and emergency care redirection.

---

## 2. Architecture & Data Flow

```text
+-----------------------------------------------------------------------------------------+
|                                    Browser Client                                       |
|                                                                                         |
|  [ Microphone ] ---> MediaStream Audio Track ---> RTCPeerConnection (SDP Offer)         |
|  [ Speakers   ] <--- Remote Audio Stream    <--- WebRTC Audio Stream (SDP Answer)       |
|                                                                                         |
|  [ VoiceSessionManager ] <==== WebRTC DataChannel ("oai-events") =====> OpenAI Realtime |
|          |                                                                              |
|          | (When model calls tool e.g. check_availability)                              |
|          v                                                                              |
|  [ HTTP POST /api/v1/voice/tools ]                                                      |
+----------|------------------------------------------------------------------------------+
           |
           v
+-----------------------------------------------------------------------------------------+
|                             Next.js App Router Server                                   |
|                                                                                         |
|  Route: POST /api/v1/voice/session                                                      |
|  - Calls OpenAI Realtime Sessions API (`/v1/realtime/sessions`) with master API Key.    |
|  - Injects SYSTEM_PROMPT & APPOINTMENT_TOOL_DEFINITIONS.                                |
|  - Returns ephemeral `client_secret` token to browser (Master API Key is never leaked). |
|                                                                                         |
|  Route: POST /api/v1/voice/tools                                                        |
|  - Validates tool name and arguments.                                                   |
|  - Dispatches to `AppointmentService.bookAppointment()` / `getAvailableSlots()`.         |
|  - Enforces dentist qualifications, calendar sync, and repository persistence.          |
|  - Returns authoritative JSON result back to browser DataChannel.                       |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Ephemeral Client Token Security

To prevent exposing the production OpenAI API key to the client browser:
1. The client browser never receives `process.env.OPENAI_API_KEY`.
2. When the user clicks "Start Call", the frontend calls Next.js Route Handler `POST /api/v1/voice/session`.
3. The server uses `OpenAIRealtimeAdapter` to call `POST https://api.openai.com/v1/realtime/sessions`.
4. OpenAI returns a short-lived ephemeral session token (`ek_...`) valid for 60 seconds to initiate WebRTC negotiation.
5. The browser initiates standard WebRTC SDP handshake with `https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview` using the ephemeral token.

---

## 4. Voice Tool Calling Over WebRTC DataChannel

The OpenAI Realtime API uses a bidirectional WebRTC DataChannel named `oai-events`. When the model decides to invoke a tool:
1. Realtime API sends `response.function_call_arguments.done` event containing:
   - `call_id`: Unique identifier for the tool call.
   - `name`: Tool name (`check_availability`, `book_appointment`, etc.).
   - `arguments`: JSON string of parsed parameters.
2. The client `VoiceSessionManager` intercepts this event and sends `POST /api/v1/voice/tools`.
3. The server runs `executeAppointmentTool` against the authoritative `AppointmentService`.
4. The client receives the server's authoritative response and sends:
   - Event `conversation.item.create`:
     ```json
     {
       "type": "conversation.item.create",
       "item": {
         "type": "function_call_output",
         "call_id": "<call_id>",
         "output": "<JSON result string>"
       }
     }
     ```
   - Event `response.create`:
     ```json
     {
       "type": "response.create"
     }
     ```
5. The Realtime API synthesizes the spoken answer using natural voice audio streamed back through the WebRTC audio track.

---

## 5. Technology Stack & Directory Layout

- **Runtime**: Bun >= 1.4.3 (`bun@1.4.4`).
- **Framework**: Next.js 16+ App Router, React 19+.
- **Protocol**: WebRTC standard (`RTCPeerConnection`, `RTCDataChannel`), fetch.
- **Files**:
  - `src/config/voice.ts` — Voice configuration and environment parsing.
  - `src/providers/voice/voice-provider.ts` — Provider-neutral interface and error types.
  - `src/providers/voice/openai-realtime-adapter.ts` — Server-side session creator.
  - `src/app/api/v1/voice/session/route.ts` — Session creation Route Handler.
  - `src/app/api/v1/voice/tools/route.ts` — Tool execution Route Handler.
  - `src/features/voice/voice-session-manager.ts` — Client-side WebRTC state machine & audio manager.
  - `src/features/voice/use-realtime-voice.ts` — React hook for UI integration.
  - `tests/voice-config.test.ts` — Configuration parsing tests.
  - `tests/openai-realtime-adapter.test.ts` — Session adapter tests.
  - `tests/voice-api-routes.test.ts` — Route handler unit tests.
  - `tests/voice-session-manager.test.ts` — Client manager logic tests.
