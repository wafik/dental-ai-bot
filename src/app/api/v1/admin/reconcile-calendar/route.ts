import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { CalendarProviderSet } from "@/providers/calendar/calendar-provider";
import type { AppointmentRepository } from "@/repository/appointment-repository";
import { getRuntimeAppointmentRepository } from "@/repository/runtime-repositories";
import { getRuntimeCalendarProvider } from "@/services/calendar-provider-cache";
import { reconcileDueCalendarSyncs } from "@/services/calendar-sync-service";

/** Upper bound per invocation so a scheduler run stays short and bounded. */
export const MAX_RECONCILE_LIMIT = 100;
const DEFAULT_RECONCILE_LIMIT = 25;

export type ReconcileCalendarRouteDeps = {
  repository?: AppointmentRepository;
  providers?: CalendarProviderSet;
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

/**
 * Constant-time bearer-token check. The endpoint is called by an external
 * scheduler, which carries no session cookie, so there is no ambient credential
 * and therefore no CSRF surface to guard.
 */
function isAuthorized(request: Request, expectedToken: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec((request.headers.get("authorization") ?? "").trim());
  if (!match) {
    return false;
  }
  const given = Buffer.from(match[1]!, "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function parseLimit(raw: string | null): number {
  const requested = Number(raw ?? DEFAULT_RECONCILE_LIMIT);
  if (!Number.isFinite(requested)) {
    return DEFAULT_RECONCILE_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(requested), 1), MAX_RECONCILE_LIMIT);
}

export function createReconcileCalendarHandler(deps: ReconcileCalendarRouteDeps = {}) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const env = deps.env ?? process.env;
      const token = env.CALENDAR_RECONCILE_TOKEN?.trim();
      if (!token) {
        return NextResponse.json(
          { success: false, error: "Calendar reconciliation is not configured" },
          { status: 503 },
        );
      }

      if (!isAuthorized(request, token)) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }

      const limit = parseLimit(new URL(request.url).searchParams.get("limit"));
      const repository = deps.repository ?? getRuntimeAppointmentRepository();
      const providers = deps.providers ?? (await getRuntimeCalendarProvider());

      const summary = await reconcileDueCalendarSyncs(repository, providers, {
        limit,
        ...(deps.now ? { now: deps.now() } : {}),
      });

      return NextResponse.json(
        { success: true, summary },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      // Provider and secret failures are redacted: no tokens, raw provider
      // bodies, or patient data may leave this route.
      return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
  };
}

export const POST = createReconcileCalendarHandler();
