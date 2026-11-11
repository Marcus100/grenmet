import type { RegisterObservationRead } from "@barrelsgd/api-client";

/**
 * The IWXXM METAR the API builds from an accepted SYNOP (#1201), in words.
 * Nothing is sent yet; this only tells the reviewer whether the record the
 * aviation channel would carry is valid. Schematron (WMO business rules) is not
 * run yet, which the line says rather than implying full validity.
 */
export interface IwxxmStatus {
  ok: boolean;
  text: string;
}

const MAX_ERRORS = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function iwxxmStatus(
  observation: RegisterObservationRead
): IwxxmStatus | null {
  const record = observation.iwxxm;
  if (!isRecord(record)) return null;
  const version =
    typeof record.version === "string" ? `IWXXM ${record.version}` : "IWXXM";
  if (record.valid === true) {
    const rules =
      record.schematron === "passed"
        ? "WMO business rules passed"
        : "WMO business rules not checked yet";
    return {
      ok: true,
      text: `${version} METAR built; schema valid (${rules}).`,
    };
  }
  const errors = Array.isArray(record.errors)
    ? record.errors.filter((item): item is string => typeof item === "string")
    : [];
  const shown = errors.slice(0, MAX_ERRORS).join("; ");
  const more =
    errors.length > MAX_ERRORS ? ` (+${errors.length - MAX_ERRORS} more)` : "";
  return {
    ok: false,
    text: `${version} METAR not valid${shown ? `: ${shown}${more}` : "."}`,
  };
}
