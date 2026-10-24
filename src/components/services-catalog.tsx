"use client";

import React from "react";
import { SERVICES, DENTISTS } from "@/domain/clinic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, UserCheck, ShieldAlert } from "lucide-react";

export type ServicesCatalogProps = {
  onSelectService?: (serviceCode: string) => void;
};

export function ServicesCatalog({ onSelectService }: ServicesCatalogProps) {
  const formatDuration = (mins: number) => {
    if (mins >= 60) {
      const hrs = mins / 60;
      return `${hrs} hour${hrs > 1 ? "s" : ""}`;
    }
    return `${mins} mins`;
  };

  const getDentistName = (id: string) => {
    return DENTISTS.find((d) => d.id === id)?.name || id;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {SERVICES.map((service) => {
        const requiresSenior = !service.eligibleDentistIds.includes("junior");

        return (
          <Card
            key={service.code}
            className="flex flex-col justify-between hover:shadow-md transition-shadow"
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="font-semibold text-xs">
                  Service {service.code}
                </Badge>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatDuration(service.durationMinutes)}</span>
                </div>
              </div>
              <CardTitle className="text-base mt-2">{service.name}</CardTitle>
              <CardDescription className="text-xs">
                {requiresSenior
                  ? "Advanced surgical / specialized procedure requiring senior qualification."
                  : "Routine clinical procedure available with all dentists."}
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-0 flex flex-col gap-3">
              <div className="space-y-1.5 border-t pt-3 text-xs">
                <div className="flex items-center gap-1 text-muted-foreground font-medium">
                  {requiresSenior ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  ) : (
                    <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                  <span>Eligible Providers:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {service.eligibleDentistIds.map((dentistId) => (
                    <Badge key={dentistId} variant="secondary" className="text-[11px] px-1.5 py-0">
                      {getDentistName(dentistId)}
                    </Badge>
                  ))}
                </div>
              </div>

              {onSelectService && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-2 text-xs"
                  onClick={() => onSelectService(service.code)}
                >
                  Inquire in Chat
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
