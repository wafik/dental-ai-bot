"use client";

import React, { useEffect, useState } from "react";
import { DENTISTS, SERVICES } from "@/domain/clinic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  RefreshCw,
  User,
  Clock,
  CheckCircle2,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import type { AppointmentRecord } from "@/domain/appointment";

export type SchedulePreviewProps = {
  initialDate?: string;
};

const PROVIDER_METADATA: Record<string, { title: string; subtitle: string; scopeBadge: string }> = {
  junior: {
    title: "Dr. Junior",
    subtitle: "General Dentist",
    scopeBadge: "Services A & B",
  },
  "senior-1": {
    title: "Dr. Senior 1",
    subtitle: "Lead Specialist",
    scopeBadge: "Full Scope (A–E)",
  },
  "senior-2": {
    title: "Dr. Senior 2",
    subtitle: "Consultant Surgeon",
    scopeBadge: "Full Scope (A–E)",
  },
};

export function SchedulePreview({ initialDate }: SchedulePreviewProps) {
  const [selectedDate, setSelectedDate] = useState<string>(
    initialDate || new Date().toISOString().split("T")[0] || "2026-10-28",
  );
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
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

  const getServiceName = (code: string) => {
    return SERVICES.find((s) => s.code === code)?.name || `Service ${code}`;
  };

  const totalBookedToday = appointments.filter((a) => a.status === "confirmed").length;

  return (
    <Card className="w-full shadow-xs border">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-semibold">
              Dentist Schedules & Real-Time Availability
            </CardTitle>
            <Badge variant="outline" className="text-[11px] font-normal">
              {totalBookedToday} Booked Total
            </Badge>
          </div>
          <CardDescription className="text-xs mt-1">
            Clinic hours 09:00 – 17:00 (Asia/Jakarta). Showing real-time confirmed bookings.
          </CardDescription>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-md border">
            <span className="text-[11px] text-muted-foreground font-medium">Date:</span>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-36 text-xs h-7 bg-background border-none shadow-none focus-visible:ring-1"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-2.5 gap-1.5 text-xs"
            onClick={() => fetchSchedule(selectedDate)}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {error && (
          <div className="p-3 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {DENTISTS.map((dentist) => {
            const dentistAppointments = appointments.filter(
              (apt) => apt.dentistId === dentist.id && apt.status === "confirmed",
            );
            const meta = PROVIDER_METADATA[dentist.id] || {
              title: dentist.name,
              subtitle: dentist.role,
              scopeBadge: "Dental Provider",
            };
            const isFullyAvailable = dentistAppointments.length === 0;

            return (
              <div
                key={dentist.id}
                className="rounded-xl border bg-card/60 p-4 flex flex-col justify-between gap-3 shadow-xs hover:border-primary/40 transition-colors"
              >
                {/* Header section with Doctor identity and badge */}
                <div className="space-y-2 border-b pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold leading-tight text-foreground">
                          {meta.title}
                        </h4>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {meta.subtitle}
                        </p>
                      </div>
                    </div>

                    <Badge
                      variant={isFullyAvailable ? "success" : "secondary"}
                      className="text-[10px] px-2 py-0.5"
                    >
                      {isFullyAvailable ? "Fully Open" : `${dentistAppointments.length} Booked`}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> 09:00 – 17:00
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[10px]">
                      <ShieldCheck className="w-3 h-3 text-primary" /> {meta.scopeBadge}
                    </span>
                  </div>
                </div>

                {/* Appointment Schedule Area */}
                <div className="flex-1 space-y-2 min-h-[160px] flex flex-col justify-center">
                  {dentistAppointments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center p-4 rounded-lg bg-muted/20 border border-dashed border-border/80">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 mb-1.5 opacity-90" />
                      <span className="text-xs font-medium text-foreground">
                        All 30-min slots open
                      </span>
                      <span className="text-[11px] text-muted-foreground mt-0.5">
                        Available for instant booking
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dentistAppointments.map((apt) => (
                        <div
                          key={apt.id}
                          className="p-2.5 rounded-lg bg-background border shadow-2xs text-xs flex flex-col gap-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-primary flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {apt.startTime} – {apt.endTime}
                            </span>
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal">
                              Confirmed
                            </Badge>
                          </div>

                          <div className="text-[11px] font-medium text-foreground flex items-center gap-1 truncate">
                            <Stethoscope className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{getServiceName(apt.serviceCode)}</span>
                          </div>

                          <div className="text-[10px] text-muted-foreground truncate border-t pt-1 flex justify-between">
                            <span>Patient: {apt.patientName}</span>
                            <span className="font-mono">({apt.patientPhone})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer slot note */}
                <div className="text-[10px] text-muted-foreground/80 text-center border-t pt-2">
                  Standard 30-min grid alignment enforced
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
