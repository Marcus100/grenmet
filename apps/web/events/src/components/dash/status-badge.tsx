import { Badge } from "@barrelsgd/ui/components/ui/badge";
import type { Status } from "@/lib/org-orders";

/** Status as words first; the colour only backs them up. */
export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge className="h-6 px-2.5 text-caption" variant={status.tone}>
      {status.label}
    </Badge>
  );
}
