// Plain sentences for the business-collected deposit, the late fee and the
// new-clients-only services. Pure, so every wording is unit-tested without a DOM.

import type {
  BookingLateFee,
  BookingPublicDetail,
  BookingPublicService,
} from "@barrelsgd/api-client";
import { formatMoney } from "./booking-format";

/** What a service asks of the customer's own deposit, paid to the business by hand. */
export function businessDepositOf(
  service: Pick<BookingPublicService, "deposit_to_business_minor"> | null
): number {
  return service?.deposit_to_business_minor ?? 0;
}

/** On the service list: "EC$53 deposit, paid to the business". */
export function businessDepositLabel(minor: number, currency: string): string {
  return `${formatMoney(minor, currency)} deposit, paid to the business`;
}

/** "Deposit received: EC$53", once the business has confirmed it. */
export function depositReceivedLine(minor: number, currency: string): string {
  return `Deposit received: ${formatMoney(minor, currency)}`;
}

/** "Deposit to pay: EC$53". */
export function depositToPayLine(minor: number, currency: string): string {
  return `Deposit to pay: ${formatMoney(minor, currency)}`;
}

/** Statuses while a business deposit is still to be paid or has been asked for. */
const DEPOSIT_STATUSES: ReadonlySet<string> = new Set(["pending", "confirmed"]);

const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "pending_payment",
  "confirmed",
]);

/** True when the booking page should show the business deposit and how to pay it. */
export function showsBusinessDeposit(
  booking: Pick<BookingPublicDetail, "deposit_to_business_minor" | "status">
): boolean {
  return (
    (booking.deposit_to_business_minor ?? 0) > 0 &&
    DEPOSIT_STATUSES.has(booking.status)
  );
}

/**
 * The business has confirmed the deposit it was paid by hand (#1869) while the
 * booking is still open. The customer sees "Deposit received" in its place; the
 * method and reference are staff-only and never reach this package.
 */
export function showsDepositReceived(
  booking: Pick<
    BookingPublicDetail,
    "deposit_received" | "deposit_to_business_minor" | "status"
  >
): boolean {
  return showsBusinessDeposit(booking) && booking.deposit_received === true;
}

/** The business deposit while it is still to pay or paid; undefined otherwise. */
export function businessDepositWhileOpen(
  booking: Pick<BookingPublicDetail, "deposit_to_business_minor" | "status">
): number | undefined {
  return showsBusinessDeposit(booking)
    ? booking.deposit_to_business_minor
    : undefined;
}

/** The late-fee rule while the booking is still on; null once it is over. */
export function lateFeeWhileActive(
  booking: Pick<BookingPublicDetail, "late_fee" | "status">
): BookingLateFee | null {
  return ACTIVE_STATUSES.has(booking.status)
    ? (booking.late_fee ?? null)
    : null;
}

function minutes(count: number): string {
  return `${count} ${count === 1 ? "minute" : "minutes"}`;
}

/** The late-arrival rule in one sentence; null when the business has none. */
export function lateFeeLine(
  lateFee: BookingLateFee | null | undefined,
  currency: string
): string | null {
  if (!lateFee || lateFee.amount_minor <= 0) {
    return null;
  }
  const fee = formatMoney(lateFee.amount_minor, currency);
  return lateFee.grace_min > 0
    ? `Arriving more than ${minutes(lateFee.grace_min)} late adds a late fee of ${fee}.`
    : `Arriving late adds a late fee of ${fee}.`;
}

export interface FirstVisit {
  first_visit_categories?: string[] | null;
  first_visit_lead_days?: number | null;
  new_clients_only?: boolean;
}

/** "hair", "hair or nails", "hair, nails or lashes". */
function listOr(items: string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

/**
 * The note for a new-clients-only service, as separate sentences: who it is
 * for (with the lead time when the business gave one), and that the business
 * confirms it. Empty for any other service. Nothing here says a customer is
 * refused: the API never refuses on history.
 */
export function newClientsNote(
  service: FirstVisit | null,
  booked = false
): string[] {
  if (!service?.new_clients_only) {
    return [];
  }
  if (booked) {
    return [
      "This service is for first-time clients. The business confirms this booking, so it stays a request until they do.",
    ];
  }
  const lead = service.first_visit_lead_days ?? 0;
  const categories = (service.first_visit_categories ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  const first =
    categories.length > 0
      ? `your first ${listOr(categories)} appointment`
      : "your first appointment";
  const who =
    lead > 0
      ? `For first-time clients. Please book at least ${lead} ${lead === 1 ? "day" : "days"} before ${first}.`
      : "For first-time clients.";
  return [
    who,
    "The business confirms this booking, so it is sent as a request.",
  ];
}

/** The segments of a plain-text message: text, or an http(s) address safe to link. */
export type TextPart =
  | { kind: "text"; start: number; text: string }
  | { kind: "link"; start: number; href: string; text: string };

const URL_CANDIDATE = /https?:\/\/[^\s<>"'`]+/giu;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/u;
const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/**
 * Drops the punctuation that ends a sentence from the address, and a closing
 * bracket only when the address has no opening one for it, so a link such as
 * https://x.org/a_(b) keeps its ")" and "(see https://x.org)" loses it.
 */
function trimAddress(raw: string): string {
  let text = raw;
  while (true) {
    const stripped = text.replace(TRAILING_PUNCTUATION, "");
    const last = stripped.at(-1);
    const opener = last ? CLOSERS[last] : undefined;
    const unmatched =
      opener !== undefined &&
      stripped.split(last ?? "").length > stripped.split(opener).length;
    if (stripped === text && !unmatched) {
      return text;
    }
    text = unmatched ? stripped.slice(0, -1) : stripped;
  }
}

/** The address when it is a plain http(s) URL with no embedded sign-in; else null. */
function safeHref(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    const plain = url.protocol === "https:" || url.protocol === "http:";
    return plain && !url.username && !url.password && url.hostname
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * Splits a business's plain text so web addresses can become links. Everything
 * else stays text (React escapes it; line breaks are kept by the host's CSS).
 * The link text is the address exactly as typed, so a link never hides where it
 * goes. Anything that is not a plain http(s) address stays text.
 */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_CANDIDATE)) {
    const raw = match[0];
    const typed = trimAddress(raw);
    const href = safeHref(typed);
    if (!href) {
      continue;
    }
    const start = match.index;
    if (start > last) {
      parts.push({ kind: "text", start: last, text: text.slice(last, start) });
    }
    parts.push({ kind: "link", start, href, text: typed });
    last = start + typed.length;
  }
  if (last < text.length) {
    parts.push({ kind: "text", start: last, text: text.slice(last) });
  }
  return parts;
}
