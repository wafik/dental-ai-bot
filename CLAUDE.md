# Project Guidelines & Agent Instructions

This repository contains the AI-driven dental appointment booking application (Frontend + Backend in Next.js App Router).

## 1. Core Stack & Tooling Pins
- **Runtime**: Bun >= 1.4.3 (current `bun@1.4.4`).
- **Framework**: Next.js 16+ (App Router), React 19+, Tailwind CSS v4 (`@tailwindcss/turbopack`), shadcn/ui.
- **Language**: TypeScript (`strict: true`).
- **Linters & Formatters (STRICT)**:
  - Format: `bun run format` (`oxfmt --write src tests`)
  - Lint: `bun run lint` (`oxlint src tests`)
  - Typecheck: `bun run check` (`bun check`)
  - **PROHIBITED**: NEVER use ESLint, Prettier, or `tsc --noEmit`.

## 2. Language & Documentation Rules
- **English Only**: ALL code comments, docstrings, inline notes, git commit messages, and documentation in this repository MUST be written in English.
- **Git Commits**: Conventional Commits in imperative mood (e.g. `feat: ...`, `fix: ...`, `test: ...`). Never commit or push unless explicitly asked by the user.

## 3. Architecture & Code Structure
- **Directory Layout**:
  - `src/app/` — Next.js App Router pages and layouts.
  - `src/components/` — UI components (`ui/` for shadcn/ui primitives, feature components).
  - `src/config/` — Environment variable parsing and runtime configuration.
  - `src/domain/` — Pure business models and scheduling rules (e.g. clinic, dentist IDs, time slots).
  - `src/providers/` — External integration adapters (e.g. `calendar/`).
  - `src/utils/` — Shared utility helpers.
  - `tests/` — Bun unit and contract tests.
- **Modularity & Simplicity**:
  - Prefer stdlib and platform built-ins (`fetch`, standard URLSearchParams, native Date/ISO).
  - Do not introduce extra SDK dependencies for operations that a few lines of standard REST/fetch can do cleanly.
  - No single-implementation abstractions or speculative scaffolding.

## 4. UI & Form Standards
- **Toast Notifications**: Use `sonner` (`toast` from `sonner`).
- **Components**: Reusable searchable dropdown / combobox, accessible dialogs.
- **Password / Secret Inputs (MANDATORY)**: Every password, admin key, API key, token, or other credential field MUST render through the shared `SecretInput` component (`src/components/admin/secret-input.tsx`), never as a raw `<Input type="password">`. It provides the eye / eye-off visibility toggle, `autoComplete="new-password"`, spellcheck off, and the write-only "Configured" affordance. Do not re-implement the toggle inline; extend `SecretInput` instead.
- **Form Validation (MANDATORY)**: Every text and password input MUST validate against a Zod schema on every change and MUST render its message directly below the field. Build the field from the shadcn `Field` primitives (`Field`, `FieldLabel`, `FieldError` from `src/components/ui/field.tsx`) with `data-invalid` on the `Field`, `aria-invalid` + `aria-describedby` on the input, and the message inside `FieldError` — it already carries `role="alert"` and destructive styling. Put the schemas in `src/utils/form-validation.ts` (shared with the route's server-side schema where one exists) and derive messages with `collectFieldErrors`. Never duplicate a rule inline or validate only on submit; shown messages are gated on blur/submit where flagging a pristine empty field would be noise, and invalid fields block the submit/save/test buttons.
- **Styling**: Tailwind v4 semantic tokens (`bg-background`, `text-foreground`, etc.), flex with `gap-*` (avoid `space-x-*` / `space-y-*`).

## 5. Calendar Integration Rules (Day 2+)
- **Provider Contract**: Both Google Calendar and Outlook/Microsoft Graph implement the provider-neutral `CalendarProvider` interface (`getBusyIntervals`, `createEvent`).
- **Authentication**:
  - Delegated OAuth using refresh tokens provided via environment variables.
  - No in-app OAuth login/consent flow in this phase.
  - In-memory access token caching with proactive refresh before expiry.
- **Security & Privacy**:
  - NEVER log, echo, or store access tokens, refresh tokens, client secrets, or raw provider error bodies.
  - Custom `CalendarProviderError` must expose only `provider`, `operation`, and optional HTTP `status`.
- **Timestamp Normalization**:
  - Timestamps must be normalized to RFC3339 UTC strings with explicit `Z` suffix.
  - Reject invalid dates, unparseable offsets, or intervals where `start >= end`.
  - Microsoft Graph `dateTimeTimeZone` objects (`{ dateTime: string, timeZone: string }`) must be validated as UTC and converted to canonical UTC ISO strings.
- **Dentist ID Mapping**:
  - Exact dentist IDs: `junior`, `senior-1`, `senior-2`. Missing mapping must throw immediately without sending external HTTP requests.
- **Test Safety**:
  - Use mocked `fetch` tests only (`bun test`).
  - NEVER make live network calls or create external cloud resources during automated tests.

## 6. Verification Checklist Before Completion
Before marking any task complete:
1. `bun run format` (oxfmt)
2. `bun run check` (bun check)
3. `bun run lint` (oxlint)
4. `bun test` (bun test)
5. `bun run build` (next build)
