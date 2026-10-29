"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type StatusRow = {
  id: string;
  label: string;
  configured: boolean;
  /** Shown instead of "Not configured" when a value is optional. */
  hint?: string;
};

/**
 * Read-only summary of which credential groups have stored values. It never
 * receives the values themselves, only their configured flag.
 */
export function ConnectionStatusCard({ rows, action }: { rows: StatusRow[]; action?: ReactNode }) {
  const configuredCount = rows.filter((row) => row.configured).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credential status</CardTitle>
        <CardDescription>
          Values are encrypted at rest and never returned to the browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{configuredCount}</span> of {rows.length}{" "}
          configured
        </p>

        <ul className="flex flex-col divide-y rounded-lg border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              data-testid={`status-${row.id}`}
            >
              <span className="text-muted-foreground">{row.label}</span>
              {row.configured ? (
                <Badge variant="success">Configured</Badge>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {row.hint ?? "Not configured"}
                </span>
              )}
            </li>
          ))}
        </ul>

        {action ? <div className="flex justify-end">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
