import { NextResponse } from "next/server";
import { InMemoryAppointmentRepository } from "@/repository/in-memory-appointment-repository";
import { AppointmentService } from "@/services/appointment-service";
import { executeAppointmentTool } from "@/services/appointment-tools";

export type VoiceToolsRouteDeps = {
  appointmentService?: AppointmentService;
};

let defaultAppointmentService: AppointmentService | null = null;

function getDefaultAppointmentService(): AppointmentService {
  if (!defaultAppointmentService) {
    const repository = new InMemoryAppointmentRepository();
    defaultAppointmentService = new AppointmentService(repository);
  }
  return defaultAppointmentService;
}

export function createVoiceToolsHandler(deps: VoiceToolsRouteDeps = {}) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const body = await request.json();
      const toolName = body?.toolName;
      const toolArgs = body?.arguments || {};

      if (!toolName || typeof toolName !== "string") {
        return NextResponse.json(
          { success: false, error: "toolName is required and must be a string" },
          { status: 400 },
        );
      }

      const service = deps.appointmentService || getDefaultAppointmentService();
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  };
}

export const POST = createVoiceToolsHandler();
