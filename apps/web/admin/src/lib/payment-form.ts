/**
 * Validation and formatting for the payments console. Pure functions, unit
 * tested; FastAPI owns the balances and re-validates every payout. Money is
 * typed as dollars and converted to integer minor units by string parsing.
 */

import { dollarsToMinor, formatMinor } from "@/lib/invoice-form";
import type { Parsed } from "@/lib/organisation-form";

export const CURRENCY = "XCD";
export const LEDGER_KINDS = [
  "charge",
  "refund",
  "fee",
  "adjustment",
  "payout",
] as const;
export type LedgerKindValue = (typeof LEDGER_KINDS)[number];

const ORGANISATION_ID = /^[A-Za-z0-9_-]{1,100}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT_MINOR = 1_000_000_000;
const MAX_REFERENCE = 200;
const MAX_NOTE = 500;
const MAX_PAGE = 10_000;
const DATE_LENGTH = 10;

/** Minor units as "XCD 1,250.50" (a leading minus is kept). */
export function formatXcd(minor: number, currency: string = CURRENCY): string {
  return `${currency} ${formatMinor(minor)}`;
}

export function parseOrganisationFilter(
  value: string | undefined
): string | undefined {
  return value && ORGANISATION_ID.test(value) ? value : undefined;
}

export function parseLedgerKind(
  value: string | undefined
): LedgerKindValue | undefined {
  return LEDGER_KINDS.find((kind) => kind === value);
}

export function parsePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_PAGE
    ? parsed
    : 1;
}

/** A real calendar day as YYYY-MM-DD, or undefined. */
export function parseDay(value: string | undefined): string | undefined {
  if (!(value && DATE.test(value))) return;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, DATE_LENGTH) === value
    ? value
    : undefined;
}

export interface Period {
  end: string;
  start: string;
}

/** Both ends inclusive; the end may not be before the start. */
export function parsePeriod(
  start: string | undefined,
  end: string | undefined
): Parsed<Period> {
  const from = parseDay(start);
  const to = parseDay(end);
  return from && to && to >= from
    ? { ok: true, value: { start: from, end: to } }
    : { ok: false };
}

export interface PayoutInput {
  amountMinor: number;
  note: string | null;
  organisationId: string;
  reference: string;
}

function field(values: Record<string, string | undefined>, key: string) {
  return (values[key] ?? "").trim();
}

/** Shared by the confirmation step (query values) and the action (form values). */
export function parsePayout(
  values: Record<string, string | undefined>
): Parsed<PayoutInput> {
  const organisationId = field(values, "organisation_id");
  const reference = field(values, "reference");
  const note = field(values, "note");
  const amountMinor = dollarsToMinor(field(values, "amount"));
  if (
    !(ORGANISATION_ID.test(organisationId) && reference) ||
    reference.length > MAX_REFERENCE ||
    note.length > MAX_NOTE ||
    amountMinor === undefined ||
    amountMinor < 1 ||
    amountMinor > MAX_AMOUNT_MINOR
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: { organisationId, reference, note: note || null, amountMinor },
  };
}

export const PAYMENT_NOTICES = {
  "payout-recorded": {
    tone: "ok",
    text: "Payout recorded in the ledger. The organisation's balance went down by that amount.",
  },
  "payout-invalid": {
    tone: "problem",
    text: "That payout was not accepted. Check the organisation, amount and reference. Nothing was recorded.",
  },
  "payout-too-large": {
    tone: "problem",
    text: "That payout is larger than the balance the organisation is owed. Nothing was recorded.",
  },
  "payout-unknown": {
    tone: "problem",
    text: "The API did not recognise that organisation. Nothing was recorded.",
  },
  "payout-failed": {
    tone: "problem",
    text: "The payout could not be recorded. Check the ledger before trying again.",
  },
} as const;

export type PaymentNoticeCode = keyof typeof PAYMENT_NOTICES;

export function paymentNoticeFor(
  code: string | undefined
): (typeof PAYMENT_NOTICES)[PaymentNoticeCode] | undefined {
  return code && Object.hasOwn(PAYMENT_NOTICES, code)
    ? PAYMENT_NOTICES[code as PaymentNoticeCode]
    : undefined;
}

export function paymentNoticeForStatus(status: number): PaymentNoticeCode {
  if (status === 409) return "payout-too-large";
  if (status === 404 || status === 400) return "payout-unknown";
  if (status === 422) return "payout-invalid";
  return "payout-failed";
}
