import { NextResponse } from "next/server";
import { SlidingWindowRateLimiter } from "@/safety/rate-limiter";
import { AppointmentService } from "@/services/appointment-service";
import { executeAppointmentTool } from "@/services/appointment-tools";
import { getRuntimeCalendarProvider } from "@/services/calendar-provider-cache";
import { getRuntimeAppointmentRepository } from "@/repository/runtime-repositories";

export type VoiceToolsRouteDeps = {
  appointmentService?: AppointmentService;
  rateLimiter?: SlidingWindowRateLimiter;
};

const GENERIC_ERROR = "Internal server error";

/** Booking and cancellation are writes, so the budget is tighter than chat. */
const defaultLimiter = new SlidingWindowRateLimiter({
  maxRequests: 20,
  windowMs: 60000,
});

/**
 * Builds the appointment service per request so calendar provider settings and
 * credentials from the admin area apply without a restart.
 */
async function buildRuntimeAppointmentService(): Promise<AppointmentService> {
  const calendarProviders = await getRuntimeCalendarProvider();
  return new AppointmentService(getRuntimeAppointmentRepository(), calendarProviders);
}

export function createVoiceToolsHandler(deps: VoiceToolsRouteDeps = {}) {
  const limiter = deps.rateLimiter ?? defaultLimiter;

  return async function POST(request: Request): Promise<Response> {
    try {
      const clientIp = request.headers.get("x-forwarded-for") || "client-local";
      if (!limiter.check(clientIp).allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "Too many requests. Please wait a moment before trying again.",
          },
          { status: 429 },
        );
      }

      const body = await request.json();
      const toolName = body?.toolName;
      const toolArgs = body?.arguments || {};

      if (!toolName || typeof toolName !== "string") {
        return NextResponse.json(
          { success: false, error: "toolName is required and must be a string" },
          { status: 400 },
        );
      }

      const service = deps.appointmentService ?? (await buildRuntimeAppointmentService());
      const rawResultString = await executeAppointmentTool(service, toolName, toolArgs);

      let parsedResult: unknown;
      try {
        parsedResult = JSON.parse(rawResultString);
      } catch {
        parsedResult = rawResultString;
      }

      return NextResponse.json(
        {
          success: true,
          toolName,
          result: parsedResult,
        },
        { status: 200 },
      );
    } catch {
      return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 500 });
    }
  };
}

export const POST = createVoiceToolsHandler();
