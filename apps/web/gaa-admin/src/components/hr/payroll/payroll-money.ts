/**
 * Money on payroll screens. The API sends integer minor units (XCD cents).
 * Digits come from the currency itself, so a currency with a different minor
 * unit still formats correctly.
 */

const LOCALE = "en-GB";
const DEFAULT_CURRENCY = "XCD";

export function minorUnitDigits(currency: string = DEFAULT_CURRENCY): number {
  return (
    new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

/** "EC$1,234.50" for 123450 minor units. Null (unpriced) is never shown as zero. */
export function formatMoney(
  minor: number | null | undefined,
  currency: string = DEFAULT_CURRENCY
): string {
  if (minor === null || minor === undefined) {
    return "Not priced";
  }
  const digits = minorUnitDigits(currency);
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

/**
 * Parse a typed amount ("1234.5", "EC$1,234.50", "$40") into minor units.
 * Returns null when the text is not an amount with at most the currency's digits.
 */
export function parseMoneyToMinor(
  input: string,
  currency: string = DEFAULT_CURRENCY
): number | null {
  const digits = minorUnitDigits(currency);
  const cleaned = input
    .trim()
    .replace(/^(EC|XCD)?\$?\s*/i, "")
    .replaceAll(",", "");
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
  if (!pattern.test(cleaned)) {
    return null;
  }
  const [whole = "0", fraction = ""] = cleaned.split(".");
  const padded = fraction.padEnd(digits, "0");
  return Number(whole) * 10 ** digits + Number(padded || "0");
}

/** Percent typed by a person ("10", "6.25") as the API's decimal fraction ("0.1000"). */
export function percentToRate(input: string): string | null {
  const trimmed = input.trim().replace(/%$/, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed) / 100;
  return value > 1 ? null : value.toFixed(4);
}
