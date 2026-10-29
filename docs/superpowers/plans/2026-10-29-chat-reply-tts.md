# Chat Reply TTS Implementation Plan

> **For agentic workers:** This plan is being executed inline in the current session. Do not commit unless the user explicitly asks. Steps use checkbox syntax for tracking.

**Goal:** Automatically speak new text-chat assistant replies by default using Kokoro behind a provider-neutral TTS contract, with user control to stop/disable speech.

**Architecture:** Add a minimal `TTSProvider` contract and a Kokoro HTTP adapter, configured server-side from environment variables. A rate-limited Next.js route validates reply text and returns audio bytes; the chat UI plays audio for newly received assistant messages and provides an accessible auto-read toggle plus per-reply retry/play control. TTS failures never block visible chat replies.

**Tech Stack:** Next.js App Router route handlers, TypeScript, Bun tests with mocked `fetch`, React state/refs, Kokoro-FastAPI's OpenAI-compatible speech endpoint.

## Global Constraints

- English only for code comments, docs, and UI copy.
- Use Bun >= 1.4.3, React 19+, Next.js 16+, and the existing dependency set; add no dependency.
- Use `bun run format`, `bun run check`, `bun run lint`, `bun test`, and `bun run build`; never use ESLint, Prettier, or `tsc --noEmit`.
- Keep text chat provider-agnostic and preserve existing voice-call behavior.
- Automated tests must mock `fetch`; do not call live services.
- Never expose secrets, raw provider bodies, or conversation text in logs/errors; do not store audio or conversation text.
- Do not commit or push.

---

## Files and Responsibilities

- Create `src/providers/tts/tts-provider.ts`: provider-neutral request/result/error contract.
- Create `src/providers/tts/kokoro-tts-adapter.ts`: server adapter for Kokoro's OpenAI-compatible `/audio/speech` endpoint.
- Create `src/config/tts.ts`: environment parsing and safe provider construction inputs.
- Create `src/app/api/v1/tts/route.ts`: request-size and schema validation, per-client rate limiting, provider invocation, audio response.
- Modify `.env.example`: document `KOKORO_TTS_BASE_URL` and `KOKORO_TTS_VOICE` placeholders.
- Modify `src/components/chat-widget.tsx`: auto-read toggle, per-reply play/retry control, playback lifecycle and fallbacks.
- Create `tests/kokoro-tts-adapter.test.ts`: mocked fetch adapter contract and failure coverage.
- Create `tests/tts-api-route.test.ts`: request validation, byte response, rate limit, and generic errors.
- Modify `tests/admin-ui.test.ts` or create `tests/chat-widget-tts.test.tsx` depending on existing test harness conventions: UI toggle, speech scope, blocked autoplay, and failure.
- Modify the external setup guide or README with Kokoro service configuration, data flow, and troubleshooting.

## Task 1: Define provider contract and Kokoro configuration

**Files:**
- Create: `src/providers/tts/tts-provider.ts`
- Create: `src/config/tts.ts`
- Modify: `.env.example`
- Test: `tests/tts-config.test.ts`

**Interfaces:**
- Produces `TTSProvider.synthesize(request: { text: string }): Promise<TTSAudio>`.
- `TTSAudio` is `{ bytes: Uint8Array; contentType: string }`.
- `TTSProviderError` exposes only provider, operation, and optional HTTP status; its message is generic and never contains upstream body text.
- `getTTSConfig(env)` returns a validated Kokoro base URL and voice; missing URL is an explicit configuration error, not a silently guessed hosted endpoint.

- [ ] **Step 1: Add tests for TTS configuration defaults and invalid values**
  - Test that `KOKORO_TTS_BASE_URL=https://kokoro.example/v1` is accepted after trimming trailing slash.
  - Test that the default voice is `af_heart` when `KOKORO_TTS_VOICE` is empty.
  - Test that missing base URL and non-HTTP(S) URLs fail with generic errors that do not include supplied URL credentials/query.
- [ ] **Step 2: Run the focused config test and confirm failure**
  - Run: `bun test tests/tts-config.test.ts`
  - Expected: fail because the config and contract do not exist.
- [ ] **Step 3: Implement the provider types and TTS config parser**
  - Keep the interface to one `synthesize` method.
  - Parse `KOKORO_TTS_BASE_URL` as HTTP(S), strip final slashes, and keep voice as a bounded non-empty string.
  - Add placeholder-only env entries to `.env.example`; no credentials.
- [ ] **Step 4: Run focused test and format touched files**
  - Run: `bun test tests/tts-config.test.ts`
  - Run: `bun run format`
  - Expected: config tests pass and formatter exits zero.

## Task 2: Implement the Kokoro adapter

**Files:**
- Create: `src/providers/tts/kokoro-tts-adapter.ts`
- Test: `tests/kokoro-tts-adapter.test.ts`

**Interfaces:**
- Constructor accepts `{ baseUrl: string; voice: string; fetchImpl?: typeof fetch; timeoutMs?: number }`.
- Implements `TTSProvider` and POSTs JSON to `${baseUrl}/audio/speech` with `{ model: "kokoro", voice, input: text, response_format: "mp3" }`.
- Returns response bytes and a safe audio content type; rejects non-audio content types, empty bodies, network/timeout failures, and non-2xx status without parsing or exposing upstream bodies.

- [ ] **Step 1: Write adapter tests with mocked fetch**
  - Assert exact URL, POST, JSON content type, model/voice/input/format, and returned byte array/content type.
  - Assert non-2xx responses do not read/echo the upstream body.
  - Assert network failure, timeout, empty response, and non-audio content type produce sanitized `TTSProviderError` values.
- [ ] **Step 2: Run focused tests and confirm expected failures**
  - Run: `bun test tests/kokoro-tts-adapter.test.ts`
  - Expected: fail because the adapter does not exist.
- [ ] **Step 3: Implement the adapter using built-in fetch and AbortController**
  - Add a bounded request timeout, cancel it in `finally`, and never log response details or text.
  - Accept only `audio/*` response media types; return bytes as `Uint8Array`.
- [ ] **Step 4: Run focused test**
  - Run: `bun test tests/kokoro-tts-adapter.test.ts`
  - Expected: all adapter tests pass.

## Task 3: Add the TTS API route

**Files:**
- Create: `src/app/api/v1/tts/route.ts`
- Test: `tests/tts-api-route.test.ts`

**Interfaces:**
- `createTTSHandler(deps?: { provider?: TTSProvider; rateLimiter?: SlidingWindowRateLimiter; env?: Record<string, string | undefined> })` returns a `POST` handler.
- Request shape: `{ text: string }`, text trimmed and constrained to 1–4000 characters.
- Success response: raw audio bytes, `Content-Type: audio/mpeg` (or validated adapter media type), `Cache-Control: no-store`.
- Failure response is generic JSON; do not expose TTS provider messages or upstream response bodies.

- [ ] **Step 1: Write route tests using an injected fake provider and limiter**
  - Cover malformed JSON, missing/blank/oversized text, body over 16 KiB, success response bytes and no-store header, limiter 429, unconfigured Kokoro service 503, and provider failure 502 with no upstream detail in the response.
  - Ensure injected dependencies avoid environment access or network calls.
- [ ] **Step 2: Run focused route test and confirm expected failures**
  - Run: `bun test tests/tts-api-route.test.ts`
  - Expected: fail because the route does not exist.
- [ ] **Step 3: Implement request validation, rate limiting, provider selection, and safe response mapping**
  - Reject an excessive declared Content-Length early; also read request text and enforce a 16 KiB UTF-8 body cap before JSON parsing.
  - Use a dedicated in-memory limiter capped at 20 requests per forwarded client IP per minute.
  - Construct `KokoroTtsAdapter` from validated server env config only when no provider is injected.
  - Use generic 503 for missing service configuration and generic 502 for synthesis failures.
- [ ] **Step 4: Run focused route tests**
  - Run: `bun test tests/tts-api-route.test.ts`
  - Expected: all route tests pass and no test performs live fetch.

## Task 4: Add chat auto-read and manual fallback controls

**Files:**
- Modify: `src/components/chat-widget.tsx`
- Test: `tests/chat-widget-tts.test.tsx` or the nearest existing UI test file, following current Bun DOM/testing conventions.

**Interfaces:**
- New chat state defaults `autoReadReplies` to `true`.
- New assistant replies only are auto-synthesized; initial greeting and client error messages are excluded.
- A “Auto-read replies” toggle is a native accessible button/checkbox with a clear checked state and English label.
- Every assistant reply has an explicit playback control that can retry synthesis after failure or play a generated audio blob after autoplay is rejected.

- [ ] **Step 1: Inspect existing UI test helpers and add failing interaction tests**
  - Verify auto-read starts enabled.
  - Verify a newly received assistant reply requests `/api/v1/tts` only when enabled.
  - Verify initial greeting and client-generated request errors do not request TTS.
  - Verify disabling auto-read aborts the current request, pauses playback, revokes the object URL, and prevents later auto-synthesis.
  - Verify blocked `audio.play()` leaves a per-reply manual play control and synthesis failure does not remove the visible reply.
  - Mock `fetch`, `URL.createObjectURL`, `URL.revokeObjectURL`, and audio playback; no actual browser audio or network.
- [ ] **Step 2: Run focused UI tests to confirm failure**
  - Run: `bun test tests/chat-widget-tts.test.tsx` (or the chosen existing UI test file).
  - Expected: fail because the controls and behavior are not implemented.
- [ ] **Step 3: Implement accessible controls and playback lifecycle**
  - Append reply text to chat immediately, then invoke TTS asynchronously.
  - Use a single current `AbortController` and audio element/object URL so a newer reply stops superseded speech and speech cannot overlap.
  - On toggle-off or unmount, abort pending fetch, pause and clear audio, and revoke any object URL.
  - On autoplay rejection, retain the generated blob and expose user-initiated replay; on synthesis failure, expose retry on that reply.
  - Avoid rendering TTS errors as chat assistant messages and never put reply text in console logs.
- [ ] **Step 4: Run focused UI tests and relevant existing chat tests**
  - Run: `bun test tests/chat-widget-tts.test.tsx tests/chat-api-route.test.ts`
  - Expected: new TTS UI tests and existing chat route tests pass.

## Task 5: Document service setup and run full verification

**Files:**
- Modify: `README.md` or `docs/EXTERNAL_CLIENT_GUIDE.md` (choose the smallest relevant existing section)
- Modify: `.env.example` if needed after runtime configuration is finalized.

- [ ] **Step 1: Document Kokoro service requirements**
  - Explain that TTS is a separate server-side HTTP service and the app uses its OpenAI-compatible `/v1/audio/speech` endpoint.
  - Document `KOKORO_TTS_BASE_URL` and `KOKORO_TTS_VOICE`, default voice `af_heart`, an example base URL, and that the service URL must be reachable from the Next.js server (not the user's browser).
  - Explain default-on auto-read, its toggle, manual playback fallback, no audio persistence, and that chat remains usable if Kokoro is unavailable.
  - Do not claim compliance guarantees or include real credentials.
- [ ] **Step 2: Run repository formatting, type, lint, and unit tests**
  - Run in order: `bun run format`, `bun run check`, `bun run lint`, `bun test`.
  - Expected: all exit zero.
- [ ] **Step 3: Run production build**
  - Run: `bun run build`.
  - Expected: Next.js build succeeds with the new route.
- [ ] **Step 4: Review changed files and report completion**
  - Inspect `git status --short` and diff for accidental changes, credentials, raw logs, and temporary files. Preserve pre-existing user modifications; do not revert unrelated changes.
  - Report verification honestly; do not commit.

## Self-review

- Spec coverage: provider contract/config (Task 1); Kokoro API adapter/timeout/sanitization (Task 2); bounded requests/rate limiting/route (Task 3); auto-read, no greeting, stop toggle, manual fallback, non-blocking failures and cleanup (Task 4); env/setup/privacy docs and all required checks (Task 5).
- No placeholders: every test case and implementation step states concrete behavior and command.
- Type consistency: route consumes `TTSProvider.synthesize({ text }) -> { bytes, contentType }`; adapter implements it; UI consumes route bytes, no Kokoro-specific UI contract.
