import type { RegisterObservationRead } from "@barrelsgd/api-client";

/**
 * Whether a saved record holds exactly these workbook values. The record's own
 * bookkeeping keys (source, validation) are not compared.
 */
export function holdsValues(
  body: RegisterObservationRead["body"],
  values: Record<string, string>
): boolean {
  if (!body) return false;
  return Object.entries(values).every(([name, value]) => body[name] === value);
}
