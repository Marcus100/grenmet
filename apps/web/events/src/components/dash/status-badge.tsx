import { Badge } from "@barrelsgd/ui/components/ui/badge";
import type { Status } from "@/lib/org-orders";

/** Status as words first; the colour only backs them up. */
export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge className="text-caption h-6 px-2.5" variant={status.tone}>
      {status.label}
    </Badge>
  );
}
