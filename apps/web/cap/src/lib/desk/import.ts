import type { CapAlertPublic } from "@barrelsgd/api-client";
import { capAlertImportRequestSchema } from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import { z } from "zod";
import { type DeskError, describeDeskError } from "@/lib/desk/errors";

/**
 * What the import form may send. The reviewed flag is checked here as well as
 * in the browser: the API never sees an import the forecaster did not confirm.
 */
export const importInputSchema = z.object({
  reviewed: z.literal(true, {
    message: "Tick the confirmation that you checked the source.",
  }),
  source: capAlertImportRequestSchema.shape.source,
  value: z
    .string()
    .trim()
    .min(1, { message: "Paste the CAP XML or the public https address." }),
});

export type ImportInput = z.infer<typeof importInputSchema>;

export type ImportOutcome =
  | {
      ok: true;
      alertId: string;
      schemaConformant: boolean;
      /** Each CAP 1.2 problem the API recorded, one per item. */
      schemaProblems: string[];
    }
  | { ok: false; error: DeskError };

const IMPORT_FAILED_PREFIX = "CAP import failed: ";

/** A saved import: conformant or not, the alert exists as a draft. */
export function outcomeFromAlert(alert: CapAlertPublic): ImportOutcome {
  const conformant = alert.schema_conformant !== false;
  const problems = conformant
    ? []
    : (alert.schema_error ?? "")
        .split("; ")
        .map((item) => item.trim())
        .filter(Boolean);
  return {
    ok: true,
    alertId: alert.id,
    schemaConformant: conformant,
    schemaProblems:
      !conformant && problems.length === 0
        ? ["The document does not follow CAP 1.2."]
        : problems,
  };
}

/**
 * Words for a refused import. A 400 is the API saying the document could not
 * be read (malformed XML, a DTD, a non-https address): show its reason and say
 * that nothing was saved.
 */
export function describeImportError(error: unknown): DeskError {
  if (isAuthApiError(error)) {
    if (error.status === 400) {
      const reason = error.detail.startsWith(IMPORT_FAILED_PREFIX)
        ? error.detail.slice(IMPORT_FAILED_PREFIX.length)
        : error.detail;
      return {
        items: reason.trim() ? [reason.trim()] : [],
        kind: "validation",
        status: 400,
        title: "The import was refused. Nothing was saved.",
      };
    }
    return describeDeskError({
      data: { detail: error.detail },
      status: error.status,
    });
  }
  return describeDeskError(error);
}
