"use server";

import { isAuthApiError } from "@barrelsgd/auth";
import { importAlert } from "@/lib/desk/api";
import { type DeskError, describeDeskError } from "@/lib/desk/errors";
import { getDeskGate } from "@/lib/desk/gate";
import {
  describeImportError,
  type ImportOutcome,
  outcomeFromAlert,
} from "@/lib/desk/import";
import { importInputSchema } from "@/lib/desk/import-input";
import { reportError } from "@/lib/report-error";

const NOT_ALLOWED: DeskError = describeDeskError({
  data: { detail: "Your account cannot import CAP warnings." },
  status: 403,
});

/**
 * Imports one CAP document for review. Runs on the server with the signed-in
 * forecaster's token; the browser sends only the validated form values. The
 * alert is saved as a draft flagged as imported and is never published here.
 *
 * Expected refusals (bad XML, no permission, schema problems) come back as
 * data so the form can list them. Unexpected failures throw to `error.tsx`.
 */
export async function importAlertAction(
  input: unknown
): Promise<ImportOutcome> {
  const gate = await getDeskGate();
  if (gate.status === "signed-out") {
    return { ok: false, error: describeDeskError({ status: 401 }) };
  }
  if (gate.status === "refused" || !gate.permissions.create) {
    return { ok: false, error: NOT_ALLOWED };
  }

  const parsed = importInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        items: parsed.error.issues.map((issue) => issue.message),
        kind: "validation",
        status: null,
        title: "Check the import before sending it.",
      },
    };
  }

  try {
    const alert = await importAlert(gate.accessToken, {
      source: parsed.data.source,
      value: parsed.data.value,
    });
    return outcomeFromAlert(alert);
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status >= 500) reportError(error, "cap-desk-import");
    return { ok: false, error: describeImportError(error) };
  }
}
