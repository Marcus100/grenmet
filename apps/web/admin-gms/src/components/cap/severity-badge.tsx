import { Badge } from "@grenmet/ui/components/ui/badge";
import type * as React from "react";
import type { CapSeverity } from "@/lib/cap-api";

const VARIANTS: Record<
  CapSeverity,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  Extreme: "solid-error",
  Severe: "solid-error",
  Moderate: "solid-warning",
  Minor: "solid-success",
  Unknown: "light-light",
};

export function SeverityBadge({ severity }: { severity?: CapSeverity }) {
  if (!severity) {
    return null;
  }
  return <Badge variant={VARIANTS[severity]}>{severity}</Badge>;
}
