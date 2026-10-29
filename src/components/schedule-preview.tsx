"use client";

import React, { useEffect, useState } from "react";
import { DENTISTS, SERVICES } from "@/domain/clinic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { collectFieldErrors, scheduleDateSchema } from "@/utils/form-validation";
import { AlertTriangle, CalendarDays, Clock, RefreshCw, ShieldCheck } from "lucide-react";
import type { AppointmentRecord } from "@/domain/appointment";

export type SchedulePreviewProps = {
  initialDate?: string;
};

// Mirrors DEFAULT_WORKING_HOURS in the appointment service. The domain module
// that owns those values also pulls in server-only code, so they are restated
// here for the client render.
const DAY_START_MINUTES = 9 * 60;
const DAY_END_MINUTES = 17 * 60;
const SLOT_MINUTES = 30;
const TOTAL_MINUTES = DAY_END_MINUTES - DAY_START_MINUTES;
const TOTAL_SLOTS = TOTAL_MINUTES / SLOT_MINUTES;
const SLOT_PERCENT = 100 / TOTAL_SLOTS;

const HOUR_MARKS = Array.from(
  { length: TOTAL_MINUTES / 60 + 1 },
  (_, index) => DAY_START_MINUTES + index * 60,
);

const PROVIDER_METADATA: Record<string, { subtitle: string; scope: string }> = {
  junior: { subtitle: "General Dentist", scope: "Services A & B" },
  "senior-1": { subtitle: "Lead Specialist", scope: "Full Scope (A–E)" },
  "senior-2": { subtitle: "Consultant Surgeon", scope: "Full Scope (A–E)" },
};

const ROW_GRID = "grid grid-cols-[minmax(170px,210px)_minmax(0,1fr)_68px] items-center gap-3";

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function toLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

/** Clamps an appointment to clinic hours and converts it to track geometry. */
function blockGeometry(appointment: AppointmentRecord) {
  const start = Math.max(toMinutes(appointment.startTime), DAY_START_MINUTES);
  const end = Math.min(toMinutes(appointment.endTime), DAY_END_MINUTES);
  const left = ((start - DAY_START_MINUTES) / TOTAL_MINUTES) * 100;
  const width = ((end - start) / TOTAL_MINUTES) * 100;
  return { left, width };
}

/** Counts distinct 30-min grid cells covered by any active booking. */
function bookedSlotCount(appointments: AppointmentRecord[]): number {
  let covered = 0;
  for (let index = 0; index < TOTAL_SLOTS; index += 1) {
    const slotStart = DAY_START_MINUTES + index * SLOT_MINUTES;
    const slotEnd = slotStart + SLOT_MINUTES;
    const overlaps = appointments.some(
      (appointment) =>
        toMinutes(appointment.startTime) < slotEnd && slotStart < toMinutes(appointment.endTime),
    );
    if (overlaps) covered += 1;
  }
  return covered;
}

function formatDayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function SchedulePreview({ initialDate }: SchedulePreviewProps) {
  const [selectedDate, setSelectedDate] = useState<string>(
    initialDate || new Date().toISOString().split("T")[0] || "2026-10-28",
  );
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedule = async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/appointments?date=${date}`);
      if (!res.ok) {
        throw new Error(`Failed to load schedule: HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.appointments)) {
        setAppointments(data.appointments);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule(selectedDate);
  }, [selectedDate]);

  const getServiceName = (code: string) =>
    SERVICES.find((service) => service.code === code)?.name || `Service ${code}`;

  const confirmed = appointments.filter((appointment) => appointment.status === "confirmed");
  const totalSlots = TOTAL_SLOTS * DENTISTS.length;
  const bookedSlots = DENTISTS.reduce(
    (sum, dentist) =>
      sum +
      bookedSlotCount(confirmed.filter((appointment) => appointment.dentistId === dentist.id)),
    0,
  );
  const freeSlots = totalSlots - bookedSlots;
  const dateError = collectFieldErrors(scheduleDateSchema, { date: selectedDate }).date;

  return (
    <Card className="@container w-full overflow-hidden">
      <CardHeader className="flex flex-col gap-4 border-b pb-4 @md:flex-row @md:items-center @md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <CardTitle className="text-base">Dentist Schedule</CardTitle>
            <Badge variant="success">
              {freeSlots} of {totalSlots} slots free
            </Badge>
          </div>
          <CardDescription className="mt-1 text-xs">
            {formatDayLabel(selectedDate)} · clinic hours {toLabel(DAY_START_MINUTES)}–
            {toLabel(DAY_END_MINUTES)} · confirmed bookings only
          </CardDescription>
        </div>

        <Field data-invalid={Boolean(dateError)} className="w-auto gap-1">
          <FieldLabel htmlFor="schedule-date" className="sr-only">
            Schedule date
          </FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id="schedule-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              aria-invalid={Boolean(dateError)}
              aria-describedby={dateError ? "schedule-date-error" : undefined}
              className={cn(
                "h-8 w-40 text-xs",
                dateError && "border-destructive focus-visible:ring-destructive",
              )}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchSchedule(selectedDate)}
              disabled={loading || Boolean(dateError)}
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden="true" />
              <span className="sr-only @md:not-sr-only">Refresh</span>
            </Button>
          </div>
          <FieldError id="schedule-date-error" className="text-xs">
            {dateError}
          </FieldError>
        </Field>
      </CardHeader>

      <CardContent className="space-y-3 pt-4">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <div className="min-w-[640px] space-y-0.5">
            {/* Hour ruler — shares the row grid so ticks line up with tracks. */}
            <div className={cn(ROW_GRID, "pb-1")} aria-hidden="true">
              <span />
              <div className="relative h-4 border-b border-border">
                {HOUR_MARKS.map((mark, index) => (
                  <span
                    key={mark}
                    className={cn(
                      "absolute top-0 text-[10px] tabular-nums text-muted-foreground",
                      index === 0 && "translate-x-0",
                      index === HOUR_MARKS.length - 1 && "-translate-x-full",
                      index > 0 && index < HOUR_MARKS.length - 1 && "-translate-x-1/2",
                    )}
                    style={{ left: `${((mark - DAY_START_MINUTES) / TOTAL_MINUTES) * 100}%` }}
                  >
                    {toLabel(mark)}
                  </span>
                ))}
              </div>
              <span />
            </div>

            {loading
              ? DENTISTS.map((dentist) => (
                  <div key={dentist.id} className={cn(ROW_GRID, "py-3")}>
                    <div className="h-9 animate-pulse rounded-md bg-muted" />
                    <div className="h-11 animate-pulse rounded-md bg-muted/60" />
                    <div className="h-4 animate-pulse rounded bg-muted" />
                  </div>
                ))
              : DENTISTS.map((dentist) => {
                  const meta = PROVIDER_METADATA[dentist.id] ?? {
                    subtitle: dentist.role === "senior" ? "Senior Dentist" : "Junior Dentist",
                    scope: "Dental Provider",
                  };
                  const dentistAppointments = confirmed.filter(
                    (appointment) => appointment.dentistId === dentist.id,
                  );
                  const booked = bookedSlotCount(dentistAppointments);
                  const free = TOTAL_SLOTS - booked;

                  return (
                    <div
                      key={dentist.id}
                      className={cn(
                        ROW_GRID,
                        "rounded-lg border border-transparent py-3 transition-colors hover:border-border hover:bg-muted/30",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5 pl-1">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                          {dentist.name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold leading-tight">
                            Dr. {dentist.name}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {meta.subtitle}
                          </p>
                        </div>
                      </div>

                      <div
                        className="relative h-11 overflow-hidden rounded-md border bg-background"
                        style={{
                          backgroundImage:
                            "linear-gradient(to right, var(--color-border) 0 1px, transparent 1px)",
                          backgroundSize: `${SLOT_PERCENT}% 100%`,
                        }}
                      >
                        {dentistAppointments.length === 0 ? (
                          <span className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
                            Fully available
                          </span>
                        ) : (
                          dentistAppointments.map((appointment) => {
                            const { left, width } = blockGeometry(appointment);
                            const serviceName = getServiceName(appointment.serviceCode);
                            return (
                              <div
                                key={appointment.id}
                                title={`${appointment.startTime}–${appointment.endTime} · ${serviceName} · ${appointment.patientName}`}
                                className="absolute inset-y-1 flex flex-col justify-center gap-0.5 overflow-hidden rounded border border-primary/25 bg-primary/10 px-1.5 pl-2.5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary before:content-['']"
                                style={{ left: `${left}%`, width: `${width}%` }}
                              >
                                <span className="truncate text-[10px] font-semibold tabular-nums leading-none text-foreground">
                                  {appointment.startTime}
                                </span>
                                <span className="truncate text-[10px] leading-none text-muted-foreground">
                                  {serviceName}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="text-right">
                        <p
                          className={cn(
                            "text-xs font-semibold tabular-nums",
                            free === 0 ? "text-muted-foreground" : "text-foreground",
                          )}
                        >
                          {free} free
                        </p>
                        <p className="text-[10px] tabular-nums text-muted-foreground">
                          {booked} booked
                        </p>
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </CardContent>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-4 py-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
          {PROVIDER_METADATA.junior?.scope} for Dr. Junior · {PROVIDER_METADATA["senior-1"]?.scope}{" "}
          for seniors
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden="true" />
          {SLOT_MINUTES}-minute grid, {TOTAL_SLOTS} slots per dentist
        </span>
      </div>
    </Card>
  );
}
