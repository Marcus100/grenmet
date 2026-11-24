import { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";
import { IMPACTS, LIKELIHOODS } from "./ibf";

type Impact = (typeof IMPACTS)[number];
type Likelihood = (typeof LIKELIHOODS)[number];

/**
 * Raise-to-warning rules the desk shows before it asks FastAPI. FastAPI decides
 * again on every call (`apps/api/fastapi/src/cap/escalation.py`); these checks
 * only save a round trip and say what to fix.
 *
 * GMS alerts are green only (ADR-0051). Raising one picks a warning colour, so
 * green is never offered here.
 */
export const WARNING_COLOURS = ["yellow", "orange", "red"] as const;
export type WarningColour = (typeof WARNING_COLOURS)[number];

/** Same minimum as `MIN_OVERRIDE_REASON` in escalation.py. */
export const MIN_OVERRIDE_REASON = 10;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const LOCAL_STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u;

/**
 * Only hazard alerts can be raised: the same nine kinds the API accepts. Forecasts
 * and the outlook are never raised, so they never appear in this list.
 */
export function isRaisableProduct(product: { kind: string }): boolean {
  return Object.hasOwn(BULLETIN_CATEGORIES, product.kind);
}

export function raisableProducts<T extends { kind: string }>(
  products: readonly T[]
): T[] {
  return products.filter(isRaisableProduct);
}

/** The hazard name shown for a raisable product, e.g. "Flood / Heavy Rain". */
export function raisableLabel(kind: string): string {
  return Object.hasOwn(BULLETIN_CATEGORIES, kind)
    ? BULLETIN_CATEGORIES[kind as keyof typeof BULLETIN_CATEGORIES]
    : kind;
}

export function isWarningColour(value: string): value is WarningColour {
  return (WARNING_COLOURS as readonly string[]).includes(value);
}

/**
 * What the impact matrix says for this alert's likelihood and impact.
 * `none`: the alert has no usable likelihood and impact, so there is nothing to
 * compare. `unknown`: the matrix could not be read, so the desk cannot tell
 * whether a reason is needed; the API still decides and refuses if one is.
 */
export type MatrixSuggestion =
  | { kind: "none" }
  | { colour: string; kind: "suggested" }
  | { kind: "unknown" };

/** The default colour: the matrix's colour when it is a warning colour, else yellow. */
export function defaultColour(suggestion: MatrixSuggestion): WarningColour {
  if (suggestion.kind === "suggested" && isWarningColour(suggestion.colour)) {
    return suggestion.colour;
  }
  return "yellow";
}

/**
 * A reason is needed when the matrix suggests a different colour, including
 * green. When the matrix could not be read, a reason is optional here.
 */
export function reasonRequired(
  suggestion: MatrixSuggestion,
  chosen: WarningColour
): boolean {
  return suggestion.kind === "suggested" && suggestion.colour !== chosen;
}

/** The message to show under the reason field, or null when it is acceptable. */
export function reasonProblem(
  reason: string,
  required: boolean
): string | null {
  const length = reason.trim().length;
  if (length >= MIN_OVERRIDE_REASON) return null;
  if (length === 0 && !required) return null;
  return required
    ? `The impact matrix suggests a different colour. Give the reason (at least ${MIN_OVERRIDE_REASON} characters).`
    : `A reason must be at least ${MIN_OVERRIDE_REASON} characters, or clear the field.`;
}

/** The likelihood and impact a GMS alert saved, when both are ones the matrix knows. */
export function matrixInputs(
  values: Record<string, string>
): { impact: Impact; likelihood: Likelihood } | null {
  const likelihood = values.likelihood?.trim() ?? "";
  const impact = values.impact?.trim() ?? "";
  if (!(LIKELIHOODS as readonly string[]).includes(likelihood)) return null;
  if (!(IMPACTS as readonly string[]).includes(impact)) return null;
  return {
    impact: impact as Impact,
    likelihood: likelihood as Likelihood,
  };
}

/**
 * A saved local time (`YYYY-MM-DDTHH:MM`, Grenada time as stored) in plain words,
 * e.g. "23 Nov 2026, 10:00". Anything else is shown as it was saved.
 */
export function localStampWords(value: string | undefined): string {
  if (!value) return "not set";
  const match = LOCAL_STAMP.exec(value);
  if (!match) return value;
  const [, year, month, day, hour, minute] = match;
  const monthIndex = Number(month) - 1;
  const name = MONTHS[monthIndex];
  if (name === undefined) return value;
  return `${Number(day)} ${name} ${year}, ${hour}:${minute}`;
}

/** "Valid from … to …" for a GMS alert, from its saved values. */
export function validityWords(values: Record<string, string>): string {
  return `Valid ${localStampWords(values.validFrom)} to ${localStampWords(values.validTo)} (Grenada time).`;
}
