import { money } from "@/domain/money";
import type { EventDetail, RefundTerms } from "@/domain/types";
import { formatPrice, isPaidTier } from "@/lib/orders";

/**
 * Refund terms in words, for buyers and organisers. Pure: the screens pass the
 * listing's values in, so the same sentence reaches the event page, the ticket
 * and the cancel form.
 */

const HOURS_PER_DAY = 24;

/** The API accepts a cutoff from 0 to 30 days. */
export const CUTOFF_HOURS_MIN = 0;
export const CUTOFF_HOURS_MAX = 720;
/** Starting value when an organiser switches to a custom deadline. */
export const DEFAULT_CUSTOM_HOURS = 72;

export const REFUND_DEADLINES = [
  "default",
  "1d",
  "2d",
  "7d",
  "30d",
  "custom",
] as const;
export type RefundDeadline = (typeof REFUND_DEADLINES)[number];

/**
 * Presets in hours. "default" saves null, so the listing follows the Barrels
 * default (the API reports its current value as `refund_cutoff_hours_effective`).
 */
const PRESET_HOURS: Record<Exclude<RefundDeadline, "custom">, number | null> = {
  default: null,
  "1d": HOURS_PER_DAY,
  "2d": 2 * HOURS_PER_DAY,
  "7d": 7 * HOURS_PER_DAY,
  "30d": 30 * HOURS_PER_DAY,
};

export const REFUND_DEADLINE_LABELS: Record<RefundDeadline, string> = {
  default: "Barrels default",
  "1d": "1 day",
  "2d": "2 days",
  "7d": "7 days",
  "30d": "30 days",
  custom: "Custom",
};

export const NO_REFUND_WARNING =
  "Grenada's Consumer Protection Act may still require refunds in some cases. Consider a refund deadline or a cancellation fee instead.";

export const STRICTER_TERMS_HINT =
  "Once tickets have sold, the terms can only become more generous: a later deadline, a smaller or no fee, or refunds switched on. Stricter terms are refused.";

/** Shown to every buyer, whatever the terms say. */
export const CANCELLED_EVENT_LINE =
  "If the organiser cancels the event, you get a full refund.";

/** Clamps a typed custom deadline to the range the API accepts. */
export function clampCutoffHours(hours: number): number {
  const whole = Number.isFinite(hours) ? Math.round(hours) : 0;
  return Math.min(CUTOFF_HOURS_MAX, Math.max(CUTOFF_HOURS_MIN, whole));
}

/** The cutoff to save: null for the default preset, else the hours. */
export function deadlineHours(
  deadline: RefundDeadline,
  customHours: number
): number | null {
  if (deadline === "custom") {
    return clampCutoffHours(customHours);
  }
  return PRESET_HOURS[deadline];
}

/** The editor's deadline control for a saved cutoff (null is the default). */
export function deadlineFromHours(hours: number | null): {
  readonly customHours: number;
  readonly deadline: RefundDeadline;
} {
  if (hours === null) {
    return { deadline: "default", customHours: DEFAULT_CUSTOM_HOURS };
  }
  const preset = REFUND_DEADLINES.find(
    (name) => name !== "custom" && PRESET_HOURS[name] === hours
  );
  if (preset) {
    return { deadline: preset, customHours: hours };
  }
  return { deadline: "custom", customHours: hours };
}

/** "1 day", "7 days", "36 hours", "1 hour". Whole days read as days. */
export function formatHours(hours: number): string {
  if (hours > 0 && hours % HOURS_PER_DAY === 0) {
    const days = hours / HOURS_PER_DAY;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function untilPhrase(hours: number): string {
  return hours === 0
    ? "the event starts"
    : `${formatHours(hours)} before the event`;
}

/** The fee as a clause, or null when no fee is kept. */
function feeClause(terms: RefundTerms): string | null {
  if (terms.feeType === "none" || terms.feeValue === 0) {
    return null;
  }
  if (terms.feeType === "fixed") {
    return `less ${formatPrice(money(terms.feeValue, "XCD"))} per ticket`;
  }
  return `less ${terms.feeValue}% of the amount paid`;
}

/**
 * One plain sentence for the terms. A buyer is asked to ask the organiser: the
 * platform does not refund on the buyer's own request. The organiser's form
 * reads the same terms as the organiser's own rule.
 */
export function refundSummary(
  terms: RefundTerms,
  audience: "buyer" | "organiser" = "buyer"
): string {
  if (terms.policy === "no_refunds") {
    return "No refunds, except if the event is cancelled.";
  }
  const until = untilPhrase(terms.cutoffHoursEffective);
  const fee = feeClause(terms);
  if (audience === "organiser") {
    return fee === null
      ? `Full refunds until ${until}.`
      : `Refunds until ${until}, ${fee}.`;
  }
  return fee === null
    ? `Ask the organiser for a full refund until ${until}.`
    : `Ask the organiser for a refund until ${until}, ${fee}.`;
}

/** Both buyer lines: the terms, then what a cancellation by the organiser means. */
export function refundTermsLines(terms: RefundTerms): {
  readonly cancelled: string;
  readonly summary: string;
} {
  return { summary: refundSummary(terms), cancelled: CANCELLED_EVENT_LINE };
}

/**
 * The terms a buyer sees for a ticket: only a ticket from a paid tier has money
 * to refund, so free and RSVP tickets get none (null).
 */
export function ticketRefundTerms(
  event: Pick<EventDetail, "refundTerms" | "tiers"> | null,
  tierName: string
): RefundTerms | null {
  if (!(event && isPaidTier(event.tiers, tierName))) {
    return null;
  }
  return event.refundTerms;
}
