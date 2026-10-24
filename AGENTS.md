<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Project Implementation Guidelines

Refer to `CLAUDE.md` for full project standards. All agents working in this repository MUST strictly follow these rules:

1. **Stack & Tooling Pins**:
   - Runtime: Bun >= 1.4.3 (`bun@1.4.4`).
   - Framework: Next.js 16+ App Router, React 19+, Tailwind CSS v4, shadcn/ui.
   - Quality checks: `bun check`, `oxlint`, `oxfmt`. NEVER use ESLint, Prettier, or `tsc --noEmit`.

2. **Language Policy**:
   - ALL code comments, docstrings, inline notes, git commit messages, and documentation must be written in **English**.

3. **Calendar Integration Architecture**:
   - Provider-neutral contract (`CalendarProvider`) in `src/providers/calendar/calendar-provider.ts`.
   - Providers: Google Calendar API v3 and Microsoft Graph REST using native `fetch` with dependency injection.
   - Delegated OAuth with refresh tokens read from configuration (`src/config/calendar.ts`).
   - Timestamps: Strict RFC3339 UTC ISO strings (`Z` suffix), validated via `normalizeCalendarInterval`.
   - Error handling: `CalendarProviderError` containing `provider`, `operation`, `status`, never leaking secrets or raw provider response bodies.
   - Mocked HTTP tests only; no live external network requests or cloud provisioning during tests.

4. **UI Standards**:
   - Toasts via `sonner`.
   - Realtime validation with Zod.
   - Reusable components for dropdowns, comboboxes, and toggle-eye password fields.

5. **Workflow Safety**:
   - Do not commit or push unless explicitly requested by the user.
   - Preserve unrelated working tree changes.
