import type {
  OrgAttendee,
  OrgOrderDetail,
  OrgOrderRow,
} from "@barrelsgd/api-client";

const MINOR_PER_MAJOR = 100;

/** Badge colours are the shared status variants; the words carry the meaning too. */
export type StatusTone =
  | "light-error"
  | "light-info"
  | "light-light"
  | "light-success"
  | "light-warning";

export const ORDER_STATUSES = [
  "confirmed",
  "pending_payment",
  "expired",
  "refunded",
] as const satisfies readonly OrgOrderRow["status"][];

export const TICKET_STATUSES = [
  "valid",
  "cancelled",
  "refunded",
] as const satisfies readonly OrgAttendee["status"][];

export const ORDER_PAGE_SIZE = 25;

export interface Status {
  readonly label: string;
  readonly tone: StatusTone;
}

const ORDER_STATUS: Record<OrgOrderRow["status"], Status> = {
  confirmed: { label: "Paid", tone: "light-success" },
  pending_payment: { label: "Awaiting payment", tone: "light-warning" },
  expired: { label: "Expired", tone: "light-light" },
  refunded: { label: "Refunded", tone: "light-info" },
};

const REFUND_STATUS: Record<OrgOrderDetail["refund_status"], Status> = {
  none: { label: "No refund", tone: "light-light" },
  queued: { label: "Refund queued", tone: "light-warning" },
  partial: { label: "Partly refunded", tone: "light-info" },
  refunded: { label: "Refunded", tone: "light-info" },
  failed: { label: "Refund failed", tone: "light-error" },
};

const TICKET_STATUS: Record<OrgAttendee["status"], Status> = {
  valid: { label: "Valid", tone: "light-success" },
  cancelled: { label: "Cancelled", tone: "light-light" },
  refunded: { label: "Refunded", tone: "light-info" },
};

export const orderStatus = (value: OrgOrderRow["status"]): Status =>
  ORDER_STATUS[value];

/**
 * The badge for an order row. A confirmed order whose tickets were all
 * cancelled reads "Cancelled" (the API keeps its status `confirmed` when the
 * money was kept), and a free order is not "Paid".
 */
export function orderBadge(
  order: Pick<
    OrgOrderRow,
    "active_ticket_count" | "payment_method" | "status" | "ticket_count"
  >
): Status {
  if (
    order.status === "confirmed" &&
    order.ticket_count > 0 &&
    order.active_ticket_count === 0
  ) {
    return { label: "Cancelled", tone: "light-light" };
  }
  if (order.status === "confirmed" && order.payment_method === "none") {
    return { label: "Free", tone: "light-success" };
  }
  return ORDER_STATUS[order.status];
}
export const refundStatus = (value: OrgOrderDetail["refund_status"]): Status =>
  REFUND_STATUS[value];
export const ticketStatus = (value: OrgAttendee["status"]): Status =>
  TICKET_STATUS[value];

export const PAYMENT_METHOD_LABEL: Record<
  OrgOrderRow["payment_method"],
  string
> = {
  none: "Free",
  cash_outlet: "Outlet cash",
  online: "Online",
};

const CODE_MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The amount with its ISO code and no symbol: "XCD 150.00", "EUR 25.00". */
export function formatOrderMoneyCode(minor: number, currency: string): string {
  return `${currency} ${CODE_MONEY.format(minor / MINOR_PER_MAJOR)}`;
}

/** "stripe" -> "Stripe", "partially_refunded" -> "Partially refunded". */
export function humanise(value: string): string {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function isOrderStatus(
  value: string | undefined
): value is OrgOrderRow["status"] {
  return ORDER_STATUSES.some((status) => status === value);
}

export function isTicketStatus(
  value: string | undefined
): value is OrgAttendee["status"] {
  return TICKET_STATUSES.some((status) => status === value);
}

/** A positive integer page from a query string, defaulting to the first. */
export function pageParam(value: string | undefined): number {
  const page = Number.parseInt(value ?? "", 10);
  return Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1;
}

export type RefundChoice = "follow_policy" | "full" | "none";

export const REFUND_CUTOFF_HOURS = 48;

export const REFUND_CHOICES: readonly {
  readonly description: string;
  readonly label: string;
  readonly value: RefundChoice;
}[] = [
  {
    value: "follow_policy",
    label: "Follow the business policy",
    description: `Paid online orders are refunded when the event starts at least ${REFUND_CUTOFF_HOURS} hours away; inside that window the money is kept.`,
  },
  {
    value: "full",
    label: "Refund in full",
    description: "Everything paid online goes back to the buyer.",
  },
  {
    value: "none",
    label: "Do not refund",
    description:
      "The money is kept. You can still refund the order by hand afterwards.",
  },
];

export const EVENT_REFUND_CHOICES: readonly {
  readonly description: string;
  readonly label: string;
  readonly value: RefundChoice;
}[] = [
  {
    value: "follow_policy",
    label: "Follow the business policy",
    description:
      "An event you cancel is refunded in full to everyone who paid online.",
  },
  {
    value: "full",
    label: "Refund in full",
    description:
      "Every order paid online is refunded. Card refunds are queued and sent to the payment provider with retries.",
  },
  {
    value: "none",
    label: "Do not refund",
    description:
      "No money moves. You refund each order by hand from the Orders screen.",
  },
];

/** The confirm button of the cancel-event dialog says what it will do. */
export const EVENT_CANCEL_BUTTON: Record<RefundChoice, string> = {
  follow_policy: "Cancel and follow policy",
  full: "Cancel and refund everyone",
  none: "Cancel, keep the money",
};

/** What a finished order cancel did with the money, in words. */
export function cancelOutcomeMessage(
  outcome: "kept" | "not_due" | "queued" | "refunded"
): string {
  switch (outcome) {
    case "refunded":
      return "Order cancelled and the money was refunded.";
    case "queued":
      return "Order cancelled. The card refund is queued with the payment provider.";
    case "kept":
      return "Order cancelled. The money was kept; refund it by hand if you need to.";
    default:
      return "Order cancelled. Nothing had been paid, so there is nothing to refund.";
  }
}

/** Counts shown after a whole event is cancelled. */
export interface CancelCounts {
  readonly ordersKept: number;
  readonly ordersQueued: number;
  readonly ordersRefunded: number;
  readonly ordersReleased: number;
  readonly refundsFailed: number;
  readonly ticketsCancelled: number;
}

const KEY_PROBLEM = /Idempotency-Key/i;
const STILL_RUNNING = /still being processed/i;
const REFUND_LEFT = /^Only (\d+) minor units can still be refunded/;

const FORBIDDEN = "You don't have permission to do that for this organisation.";

/** Shown when a money request may or may not have gone through. */
export const COULDNT_CONFIRM =
  "We couldn't confirm this went through. Reload the page and check the order before changing anything.";

/**
 * Words an org-zone refusal for the organiser. The API words its own 409s
 * ("This order is already paid"), so those pass through; the generic cases get
 * a next step. 403 and 404 usually carry no usable detail.
 */
export const CANCEL_FORBIDDEN =
  "Your role or this organisation's Events access doesn't allow cancelling. Ask an owner or Barrels support.";

export function friendlyOrgError(
  status: number,
  detail: string | null,
  currency = "XCD"
): string {
  if (status === 403) {
    return detail ?? FORBIDDEN;
  }
  if (status === 404) {
    return "We couldn't find that order or event for this organiser. Reload the page.";
  }
  if (status === 422) {
    return "The server rejected some of the details. Check the form and try again.";
  }
  if (status === 409) {
    if (detail && STILL_RUNNING.test(detail)) {
      return "The first attempt is still being processed. Wait a moment, then press the button again.";
    }
    if (detail && KEY_PROBLEM.test(detail)) {
      return "That request changed since the last attempt. Check the form and try again.";
    }
    const left = detail ? REFUND_LEFT.exec(detail) : null;
    if (left?.[1]) {
      return `Only ${formatOrderMoneyCode(Number(left[1]), currency)} can still be refunded. Reload the page to see the current amount.`;
    }
    return detail ?? "That can't be done in the order's current state.";
  }
  return detail ?? "That didn't work. Check it and try again.";
}

/** True when the same Idempotency-Key must be sent again (the first try may have landed). */
export function keepsKey(status: number | null, detail: string | null) {
  if (status === null || status >= 500) {
    return true;
  }
  return status === 409 && STILL_RUNNING.test(detail ?? "");
}
