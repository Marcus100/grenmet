import type { CurrencyCode, Money } from "./types";

/**
 * Display symbol per currency.
 *
 * XCD renders as a bare "$" for now to match the existing organiser screens.
 * Whether Grenadian organisers should see "EC$" is a product decision that
 * belongs with the attendee-facing surface, not this refactor.
 */
const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  XCD: "$",
  USD: "$",
};

const MINOR_UNITS_PER_MAJOR = 100;
const DOLLARS = /^\d+(\.\d{1,2})?$/u;
/** Thousands separators must group exactly three digits ("1,250.00", never "10,50"). */
const GROUPED_DOLLARS = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/u;
const MAX_WHOLE_DIGITS = 12;

const groupingFormat = new Intl.NumberFormat("en-US", {
  useGrouping: true,
  maximumFractionDigits: 0,
});

export function money(amountMinor: number, currency: CurrencyCode): Money {
  return { amountMinor, currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function sumMoney(
  amounts: readonly Money[],
  currency: CurrencyCode
): Money {
  return amounts.reduce<Money>(
    (total, amount) => addMoney(total, amount),
    money(0, currency)
  );
}

/**
 * Formats an amount for display.
 *
 * Formatting works from the integer minor units rather than dividing into a
 * float, so a value never drifts by a cent on the way to the screen.
 */
export function formatMoney(
  amount: Money,
  options: { readonly decimals?: boolean } = {}
): string {
  const { decimals = true } = options;
  const isNegative = amount.amountMinor < 0;
  const absolute = Math.abs(amount.amountMinor);
  const major = Math.trunc(absolute / MINOR_UNITS_PER_MAJOR);
  const minor = absolute % MINOR_UNITS_PER_MAJOR;

  const rounded =
    decimals || minor < MINOR_UNITS_PER_MAJOR / 2 ? major : major + 1;
  const whole = groupingFormat.format(decimals ? major : rounded);
  const fraction = decimals ? `.${String(minor).padStart(2, "0")}` : "";

  return `${isNegative ? "−" : ""}${CURRENCY_SYMBOL[amount.currency]}${whole}${fraction}`;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(
      `Cannot combine ${a.currency} with ${b.currency}. Convert before calculating.`
    );
  }
}

/**
 * Parses a typed dollar amount ("25", "25.5", "1,250.00") into minor units.
 * Returns null when the text isn't a non-negative amount with at most two
 * decimals, so the UI never guesses at a cash figure.
 */
export function parseMinor(text: string): number | null {
  const trimmed = text.trim();
  if (!(DOLLARS.test(trimmed) || GROUPED_DOLLARS.test(trimmed))) {
    return null;
  }
  const cleaned = trimmed.replaceAll(",", "");
  const [whole = "0", fraction = ""] = cleaned.split(".");
  if (whole.length > MAX_WHOLE_DIGITS) {
    return null;
  }
  return (
    Number.parseInt(whole, 10) * MINOR_UNITS_PER_MAJOR +
    Number.parseInt(fraction.padEnd(2, "0"), 10)
  );
}
