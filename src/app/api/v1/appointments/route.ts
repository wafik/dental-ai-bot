import { NextResponse } from "next/server";
import { z } from "zod";
import { getRuntimeAppointmentRepository } from "@/repository/runtime-repositories";
import { getRuntimeCalendarProvider } from "@/services/calendar-provider-cache";
import { AppointmentService } from "@/services/appointment-service";
import type { AppointmentRepository } from "@/repository/appointment-repository";
import {
  AppointmentError,
  DentistQualificationError,
  SlotUnavailableError,
} from "@/domain/appointment";

export type AppointmentsRouteDeps = {
  repository?: AppointmentRepository;
  appointmentService?: AppointmentService;
};

const BookAppointmentSchema = z.object({
  patientName: z.string().min(2, "Patient name must be at least 2 characters"),
  patientPhone: z.string().min(6, "Patient phone must be at least 6 characters"),
  serviceCode: z.enum(["A", "B", "C", "D", "E"]),
  dentistId: z.enum(["junior", "senior-1", "senior-2"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Start time must use HH:mm format"),
});

export function createAppointmentsHandlers(deps: AppointmentsRouteDeps = {}) {
  // Production defaults resolve the PostgreSQL-backed repository and the
  // provider-configured service lazily, per request. There is deliberately no
  // in-memory fallback; tests inject their own dependencies instead.
  const getRepository = () => deps.repository ?? getRuntimeAppointmentRepository();

  const getAppointmentService = async (repository: AppointmentRepository) => {
    if (deps.appointmentService) {
      return deps.appointmentService;
    }
    const calendarProvider = await getRuntimeCalendarProvider();
    return new AppointmentService(repository, calendarProvider);
  };

  const GET = async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const dateParam = url.searchParams.get("date");

      if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return NextResponse.json(
          {
            success: false,
            error: "Valid date query parameter (YYYY-MM-DD) is required",
          },
          { status: 400 },
        );
      }

      // Public listings expose confirmed records only; pending reservations and
      // failed records stay internal. Reading them needs no calendar provider.
      const appointments = await getRepository().find({
        date: dateParam,
        status: "confirmed",
      });

      return NextResponse.json(
        {
          success: true,
          date: dateParam,
          totalConfirmed: appointments.length,
          appointments,
        },
        { status: 200 },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  };

  const POST = async (request: Request): Promise<Response> => {
    try {
      const body = await request.json();
      const validation = BookAppointmentSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          {
            success: false,
            error: validation.error.issues.map((i) => i.message).join(", "),
          },
          { status: 400 },
        );
      }

      const repository = getRepository();
      const appointmentService = await getAppointmentService(repository);
      const appointment = await appointmentService.bookAppointment(validation.data);

      return NextResponse.json(
        {
          success: true,
          appointment,
        },
        { status: 201 },
      );
    } catch (err: unknown) {
      if (err instanceof DentistQualificationError || err instanceof SlotUnavailableError) {
        return NextResponse.json(
          { success: false, error: err.message, code: err.code },
          { status: 422 },
        );
      }
      if (err instanceof AppointmentError) {
        // The reservation was released, so retrying is safe; the upstream
        // calendar is the failing component.
        const status = err.code === "CALENDAR_SYNC_FAILED" ? 502 : 400;
        return NextResponse.json(
          { success: false, error: err.message, code: err.code },
          { status },
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  };

  return { GET, POST };
}

const defaultHandlers = createAppointmentsHandlers();
export const GET = defaultHandlers.GET;
export const POST = defaultHandlers.POST;
