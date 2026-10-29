# Chat Reply Text-to-Speech Design

**Date:** 2026-10-29

**Status:** Approved; implementation in progress

**Scope:** Read new text-chat assistant replies aloud, with Kokoro as the default TTS adapter while keeping the application provider-agnostic.

## Context

`docs/task.md` requires the application to remain agnostic to AI providers. The existing text chat is provider-neutral at the LLM contract but currently returns and renders text only. Voice calls already use OpenAI Realtime audio; this design adds speech output to text chat without coupling chat orchestration to Kokoro or changing the voice-call implementation.

## Goals

- Automatically read new assistant replies aloud by default.
- Provide an accessible control to disable auto-reading; disabling it stops current playback and suppresses future automatic speech.
- Do not read the initial greeting on page load.
- Keep Kokoro as the default runtime implementation behind a provider-neutral TTS contract.
- Keep text chat usable if TTS is unavailable, slow, or rejected by browser autoplay policy.
- Avoid storing generated audio or logging message text/audio.

## Non-goals

- Speaking user messages, the initial greeting, or client-generated network error notices.
- Replacing or modifying the existing Realtime voice-call flow.
- Persisting a user's auto-read preference across browser sessions.
- Adding streaming synthesis, voice selection UI, or conversation audio downloads.

## Architecture

1. **Provider contract and adapter** — Add a small `TTSProvider` contract under `src/providers/tts/` with a synthesis operation that accepts text and returns audio bytes plus a validated media type. Implement `KokoroTtsAdapter` as the default adapter. The adapter calls a separately deployed Kokoro HTTP service using server-only environment configuration; app code does not import or bundle the model/runtime.
2. **Runtime configuration** — Read the Kokoro service base URL and voice from environment variables on the server. Use a documented default voice and allow environment overrides. Keep credentials, if required by a deployment, server-only. Do not add TTS configuration to the admin UI in this scope.
3. **Application route** — Add `POST /api/v1/tts`. Validate a bounded non-empty text input, apply a dedicated per-client rate limit, call the configured `TTSProvider`, and return audio bytes with the provider's safe content type. Return generic errors without exposing provider response bodies or request text. Do not cache or persist audio.
4. **Chat UI** — Add an “Auto-read replies” toggle, enabled by default. On each successful newly received assistant reply, request audio from the application route and play it. Exclude the initial greeting and client-generated error messages. If auto-play is blocked or synthesis fails, leave the text reply available and expose a per-reply “Play audio” control. Turning the toggle off aborts pending TTS work and stops current audio.

## User and data flow

1. The user sends a text message; the existing chat API returns the assistant reply as before.
2. The chat UI appends the reply immediately so TTS does not delay the visible conversation.
3. If auto-read is enabled, the browser POSTs only the assistant reply text to `/api/v1/tts`.
4. The server validates and rate-limits the request, then sends the text to the configured Kokoro service through the adapter.
5. The server returns audio bytes; the browser creates a temporary object URL and plays it. The URL and audio element are released when playback ends, when playback is stopped, or when the component unmounts.
6. If synthesis or playback fails, the chat remains functional and the reply can be played manually when an audio response is available.

## Failure handling and privacy

- TTS failures must never roll back, replace, or delay the chat reply.
- A newer reply supersedes older pending/playing TTS so replies do not overlap; the user may manually replay a reply afterward.
- Validate text length at the route boundary and reject unsupported or oversized input before calling the provider.
- Use a request timeout and a dedicated TTS rate limiter. Keep provider errors generic and never include raw upstream bodies, secrets, or conversation text in logs or client error responses.
- Do not store conversation text or generated audio in the TTS route. Generated browser object URLs must be revoked.
- The configured Kokoro service receives assistant reply text. Deployments must keep that service on a trusted network and apply their clinic's data-handling requirements; no claim of HIPAA compliance is implied by this feature.

## Verification

- Unit tests for Kokoro request/response handling, timeout and non-2xx error sanitization, and route validation/rate limiting use mocked `fetch` only.
- Chat UI tests cover default-enabled toggle, disabling/stopping playback, synthesis only for new successful assistant replies, no initial-greeting speech, manual playback fallback, and non-blocking TTS failure.
- Run the repository checklist: `bun run format`, `bun run check`, `bun run lint`, `bun test`, and `bun run build`.

## Acceptance criteria

- A new successful assistant reply is automatically read aloud when auto-read is enabled.
- Auto-read starts enabled on a fresh page; the initial greeting is not spoken.
- The user can disable auto-read; doing so stops active playback and prevents later automatic synthesis/playback.
- If browser playback is blocked, the user can explicitly start playback for that reply.
- Kokoro is the default provider implementation, but chat UI and route depend on the provider-neutral contract rather than Kokoro-specific details.
- Chat behavior and visible replies remain available when the TTS service fails.
- No audio or conversation content is persisted or emitted in logs.
