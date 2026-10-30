"use client";

import { Badge } from "@/components/ui/badge";
import { CALENDAR_PROVIDER_LABELS, type CalendarProviderId } from "@/domain/admin-settings";

const VARIANTS: Record<CalendarProviderId, "success" | "warning" | "outline"> = {
  none: "outline",
  both: "success",
};

/** One consistent rendering of the active calendar mode across the admin surface. */
export function ProviderBadge({ provider }: { provider: CalendarProviderId }) {
  return <Badge variant={VARIANTS[provider]}>{CALENDAR_PROVIDER_LABELS[provider]}</Badge>;
}
