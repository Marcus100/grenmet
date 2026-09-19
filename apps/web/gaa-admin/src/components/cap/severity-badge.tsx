import { Badge } from "@barrelsgd/ui/components/ui/badge";
import type * as React from "react";
import type { CapSeverity } from "@/lib/cap-api";
import { SEVERITY_BADGE_VARIANT } from "@/lib/cap-severity";

export function SeverityBadge({ severity }: { severity?: CapSeverity }) {
  if (!severity) {
    return null;
  }
  const variant = SEVERITY_BADGE_VARIANT[severity] as React.ComponentProps<
    typeof Badge
  >["variant"];
  return <Badge variant={variant}>{severity}</Badge>;
}
