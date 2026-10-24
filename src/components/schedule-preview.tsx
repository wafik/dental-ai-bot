"use client";

import React, { useEffect, useState } from "react";
import { DENTISTS } from "@/domain/clinic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, RefreshCw, User } from "lucide-react";
import type { AppointmentRecord } from "@/domain/appointment";

export type SchedulePreviewProps = {
  initialDate?: string;
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

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Dentist Daily Schedule & Status
          </CardTitle>
          <CardDescription className="text-xs">
            Real-time schedule preview across clinic working hours (09:00 – 17:00).
          </CardDescription>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40 text-xs h-8"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2"
            onClick={() => fetchSchedule(selectedDate)}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
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

            return (
              <div
                key={dentist.id}
                className="border rounded-lg p-3 bg-muted/20 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <h4 className="text-xs font-semibold">{dentist.name}</h4>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {dentist.id.replace("-", " ")}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={dentistAppointments.length > 0 ? "secondary" : "outline"}
                    className="text-[10px]"
                  >
                    {dentistAppointments.length} Booked
                  </Badge>
                </div>

                <div className="space-y-2 min-h-[140px]">
                  {dentistAppointments.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground py-8">
                      All slots open (09:00 - 17:00)
                    </div>
                  ) : (
                    dentistAppointments.map((apt) => (
                      <div
                        key={apt.id}
                        className="p-2 rounded bg-card border shadow-xs text-xs flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-primary">
                            {apt.startTime} - {apt.endTime}
                          </span>
                          <Badge variant="success" className="text-[9px] px-1 py-0">
                            Confirmed
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          Patient: {apt.patientName}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          Service {apt.serviceCode}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
