import type { BookingStatus } from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  type BadgeTone,
  type DepositState,
  depositView,
  type PaymentKind,
  paymentWord,
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

export function StatusBadge({
  kind,
  status,
}: {
  kind?: PaymentKind;
  status: BookingStatus;
}) {
  const view = statusView(status, kind);
  return (
    <Badge className={BADGE_SIZE} variant={VARIANT[view.tone]}>
      {view.label}
    </Badge>
  );
}

/** A held booking whose deposit window closes within two hours (text, not colour alone). */
export function ExpiresSoonBadge() {
  return (
    <Badge className={BADGE_SIZE} variant={VARIANT.warning}>
      Expires soon
    </Badge>
  );
}

/** A cancelled booking's unpaid payment: neutral, and never "due" (#1849). */
export function PaymentCancelledBadge({ kind }: { kind?: PaymentKind }) {
  return (
    <Badge className={BADGE_SIZE} variant="outline">
      {`${paymentWord(kind)} cancelled`}
    </Badge>
  );
}

/** The detail page's payment badge: a cancelled booking owes nothing. */
export function PaymentBadge({
  kind,
  state,
  status,
}: {
  kind?: PaymentKind;
  state: DepositState;
  status: BookingStatus;
}) {
  if (status === "cancelled" && state === "due") {
    return <PaymentCancelledBadge kind={kind} />;
  }
  return <DepositBadge kind={kind} state={state} />;
}

export function DepositBadge({
  kind,
  state,
  view = depositView(state ?? "none", kind),
}: {
  kind?: PaymentKind;
  state?: DepositState;
  view?: StatusView;
}) {
  return (
    <Badge className={BADGE_SIZE} variant={VARIANT[view.tone]}>
      {view.label}
    </Badge>
  );
}
