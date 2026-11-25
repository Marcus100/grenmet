// The late fee a business sets in studio Settings: an amount in currency units
// (blank or 0 means no fee) and the minutes of lateness allowed before it
// applies (0 to 240). The API takes the amount in minor units, at least 1.

import { formatMoney } from "@barrelsgd/bookings-web/lib/booking-format";
import { parseMoney } from "./settings-view";

export const LATE_GRACE_MAX = 240;
const MAX_LATE_FEE_MINOR = 100_000_000;
const WHOLE_NUMBER = /^\d{1,3}$/u;

export type LateFeeResult =
  | { ok: true; value: number | null }
  | { ok: false; message: string };

/** The fee text as minor units; blank or zero is no fee (null). */
export function lateFeeMinor(text: string): LateFeeResult {
  const value = text.trim();
  if (value === "") {
    return { ok: true, value: null };
  }
  const minor = parseMoney(value);
  if (minor === null) {
    return {
      ok: false,
      message: "Enter the late fee as an amount like 20 or 20.50.",
    };
  }
  if (minor > MAX_LATE_FEE_MINOR) {
    return { ok: false, message: "The late fee is at most 1,000,000." };
  }
  return { ok: true, value: minor === 0 ? null : minor };
}

/** The grace period text as whole minutes; blank is 0. */
export function graceMinutes(
  text: string
): { ok: true; value: number } | { ok: false; message: string } {
  const value = text.trim();
  if (value === "") {
    return { ok: true, value: 0 };
  }
  if (!WHOLE_NUMBER.test(value) || Number(value) > LATE_GRACE_MAX) {
    return {
      ok: false,
      message: `Enter whole minutes from 0 to ${LATE_GRACE_MAX}.`,
    };
  }
  return { ok: true, value: Number(value) };
}

/** The sentence a customer sees; null when there is no late fee. */
export function lateFeeSentence(
  feeMinor: number | null,
  graceMin: number,
  currency: string
): string | null {
  if (feeMinor === null) {
    return null;
  }
  const fee = formatMoney(feeMinor, currency);
  if (graceMin <= 0) {
    return `Arriving late adds a late fee of ${fee}.`;
  }
  const minutes = graceMin === 1 ? "1 minute" : `${graceMin} minutes`;
  return `Arriving more than ${minutes} late adds a late fee of ${fee}.`;
}
