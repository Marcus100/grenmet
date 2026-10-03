const NICKNAME = /\s*\(.*\)$/;
const NAME_SEPARATORS = /[\s,]+/;
const YEAR_MONTH = /^\d{4}-\d{2}$/;

const NUMBER = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** Whole number with thousands separators; "–" when there is no figure. */
export function fmt(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? "–" : NUMBER.format(Math.round(n));
}

/** A share (0–1) as a percentage; "–" when there is no figure. */
export function pct(x: number | null | undefined, digits = 1): string {
  return x == null || !Number.isFinite(x)
    ? "–"
    : `${(x * 100).toFixed(digits)}%`;
}

/** Surname from "First Last" or "Last, F." forms, dropping "(nickname)". */
export function surname(name: string): string {
  const parts = name
    .replace(NICKNAME, "")
    .split(NAME_SEPARATORS)
    .filter(Boolean);
  return parts.at(-1) ?? name;
}

const LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-10-04" → "4 October 2026"; "2023-05" → "May 2023". */
export function formatIsoDate(iso: string): string {
  if (YEAR_MONTH.test(iso)) return MONTH.format(new Date(`${iso}-01`));
  return LONG_DATE.format(new Date(iso));
}
