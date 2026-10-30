import { beforeEach, describe, expect, it } from "bun:test";
import { createReconcileCalendarHandler } from "../src/app/api/v1/admin/reconcile-calendar/route";
import type { BookAppointmentInput } from "../src/domain/appointment";
import { CalendarProviderError } from "../src/providers/calendar/calendar-error";
import type {
  CalendarEventInput,
  CalendarProvider,
  CreatedCalendarEvent,
} from "../src/providers/calendar/calendar-provider";
import { InMemoryAppointmentRepository } from "../src/repository/in-memory-appointment-repository";
import { AppointmentService } from "../src/services/appointment-service";

const TOKEN = "scheduler-secret-token";
const ENV = { CALENDAR_RECONCILE_TOKEN: TOKEN };
const URL = "http://localhost/api/v1/admin/reconcile-calendar";

const bookingInput: BookAppointmentInput = {
  patientName: "Reconcile Patient",
  patientPhone: "08123456789",
  serviceCode: "A",
  dentistId: "junior",
  date: "2026-11-13",
  startTime: "09:00",
};

class FlakyProvider implements CalendarProvider {
  failures = 0;
  created: CalendarEventInput[] = [];
  error: () => unknown = () =>
    new CalendarProviderError({
      message: "provider rejected the request",
      provider: "google",
      operation: "createEvent",
      status: 429,
    });

  async getBusyIntervals() {
    return [];
  }

  async createEvent(input: CalendarEventInput): Promise<CreatedCalendarEvent> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw this.error();
    }
    this.created.push(input);
    return { id: "g-evt", start: input.start, end: input.end };
  }

  async deleteEvent(): Promise<void> {}
}

function post(headers: Record<string, string> = {}, query = ""): Request {
  return new Request(`${URL}${query}`, { method: "POST", headers });
}

describe("POST /api/v1/admin/reconcile-calendar", () => {
  let repository: InMemoryAppointmentRepository;
  let provider: FlakyProvider;

  beforeEach(() => {
    repository = new InMemoryAppointmentRepository();
    provider = new FlakyProvider();
  });

  it("returns 503 when no reconciliation token is configured", async () => {
    const handler = createReconcileCalendarHandler({ repository, providers: {}, env: {} });
    const response = await handler(post({ authorization: `Bearer ${TOKEN}` }));

    expect(response.status).toBe(503);
  });

  it("rejects a missing or wrong bearer token", async () => {
    const handler = createReconcileCalendarHandler({ repository, providers: {}, env: ENV });

    expect((await handler(post())).status).toBe(401);
    expect((await handler(post({ authorization: "Bearer wrong" }))).status).toBe(401);
  });

  it("retries due rows and reports only counts", async () => {
    provider.failures = 1;
    const service = new AppointmentService(repository, { google: provider });
    const booked = await service.bookAppointment(bookingInput);
    expect(booked.status).toBe("pending");

    const handler = createReconcileCalendarHandler({
      repository,
      providers: { google: provider },
      env: ENV,
      // Later than the first retry backoff.
      now: () => new Date(Date.now() + 5 * 60_000),
    });

    const response = await handler(post({ authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const text = await response.text();
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("Reconcile Patient");
    expect(JSON.parse(text)).toEqual({
      success: true,
      summary: {
        claimed: 1,
        succeeded: 1,
        retried: 0,
        manual: 0,
        confirmed: 1,
        cancelled: 0,
      },
    });
    expect((await repository.findById(booked.id))?.status).toBe("confirmed");
  });

  it("clamps the limit and defaults to a bounded batch", async () => {
    const handler = createReconcileCalendarHandler({
      repository,
      providers: { google: provider },
      env: ENV,
    });

    const response = await handler(post({ authorization: `Bearer ${TOKEN}` }, "?limit=100000"));
    expect(response.status).toBe(200);
    expect((await response.json()).summary.claimed).toBe(0);
  });

  it("redacts provider failures and never leaks raw error text", async () => {
    provider.failures = 1;
    provider.error = () =>
      new CalendarProviderError({
        message: "raw provider body",
        provider: "google",
        operation: "createEvent",
      });
    const service = new AppointmentService(repository, { google: provider });
    await service.bookAppointment(bookingInput);

    const handler = createReconcileCalendarHandler({
      repository,
      providers: { google: provider },
      env: ENV,
      now: () => new Date(Date.now() + 5 * 60_000),
    });

    const text = await (await handler(post({ authorization: `Bearer ${TOKEN}` }))).text();
    expect(text).not.toContain("raw provider body");
  });
});
