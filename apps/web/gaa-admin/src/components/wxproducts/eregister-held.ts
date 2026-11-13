import type { RegisterObservationRead } from "@barrelsgd/api-client";

/** The record's own bookkeeping keys, never part of the observer's values. */
const BOOKKEEPING_KEYS = new Set(["source", "validation"]);

/**
 * Whether a saved record holds exactly these workbook values: every form value
 * is in the record, and the record holds no other filled-in value (for
 * example a rainfall or extremes group the form no longer has). The record's
 * bookkeeping keys (source, validation) are not compared.
 */
export function holdsValues(
  body: RegisterObservationRead["body"],
  values: Record<string, string>
): boolean {
  if (!body) return false;
  const formHasEach = Object.entries(values).every(
    ([name, value]) => body[name] === value
  );
  if (!formHasEach) return false;
  return Object.entries(body).every(
    ([name, value]) =>
      BOOKKEEPING_KEYS.has(name) ||
      value === null ||
      value === undefined ||
      value === "" ||
      values[name] === value
  );
}
