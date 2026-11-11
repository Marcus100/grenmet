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

const MAX_ERROR_CHARS = 120;

function short(text: string): string {
  return text.length > MAX_ERROR_CHARS
    ? `${text.slice(0, MAX_ERROR_CHARS - 1)}…`
    : text;
}

export function iwxxmStatus(
  observation: RegisterObservationRead
): IwxxmStatus | null {
  const record = observation.iwxxm;
  if (!isRecord(record)) return null;
  const version =
    typeof record.version === "string" ? `IWXXM ${record.version}` : "IWXXM";
  if (record.valid === true)
    return {
      ok: true,
      text: `${version} METAR built; schema valid (WMO business rules not checked yet).`,
    };
  const errors = Array.isArray(record.errors)
    ? record.errors.filter((item): item is string => typeof item === "string")
    : [];
  // The API stores null when the XSD schemas are not installed on the server:
  // validity is unknown, not failed.
  if (record.valid !== false && errors.length === 0)
    return {
      ok: true,
      text: `${version} METAR built; schema check not run on this server.`,
    };
  const shown = errors.slice(0, MAX_ERRORS).map(short).join("; ");
  const more =
    errors.length > MAX_ERRORS ? ` (+${errors.length - MAX_ERRORS} more)` : "";
  return {
    ok: false,
    text: `${version} METAR not valid${shown ? `: ${shown}${more}` : "."}`,
  };
}
