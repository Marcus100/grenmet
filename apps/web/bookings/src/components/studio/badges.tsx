import type { BookingStatus } from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  type BadgeTone,
  type DepositState,
  depositView,
  type StatusView,
  statusView,
} from "@/lib/studio-view";

const VARIANT = {
  success: "light-success",
  warning: "light-warning",
  error: "light-error",
  info: "light-info",
  neutral: "outline",
} as const satisfies Record<BadgeTone, string>;

// Status is always a word as well as a colour (docs/design/bookings.md).
const BADGE_SIZE = "h-6 px-2.5 text-xs";

export function StatusBadge({ status }: { status: BookingStatus }) {
  const view = statusView(status);
  return (
    <Badge className={BADGE_SIZE} variant={VARIANT[view.tone]}>
      {view.label}
    </Badge>
  );
}

export function DepositBadge({
  state,
  view = depositView(state ?? "none"),
}: {
  state?: DepositState;
  view?: StatusView;
}) {
  return (
    <Badge className={BADGE_SIZE} variant={VARIANT[view.tone]}>
      {view.label}
    </Badge>
  );
}
