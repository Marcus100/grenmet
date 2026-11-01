"use server";

import type { IbfSuggestion } from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import { suggestIbf } from "@/lib/desk/api";
import { type DeskError, describeDeskError } from "@/lib/desk/errors";
import { getDeskGate } from "@/lib/desk/gate";
import { suggestInputSchema } from "@/lib/desk/ibf";
import { reportError } from "@/lib/report-error";

export type SuggestOutcome =
  | { ok: true; suggestion: IbfSuggestion }
  | { ok: false; error: DeskError };

/**
 * Advice only. Returns the colour and starting wording for one likelihood and
 * impact. Nothing is saved and nothing is filled in: the forecaster must take
 * the advice into the warning themselves.
 */
export async function suggestIbfAction(
  input: unknown
): Promise<SuggestOutcome> {
  const gate = await getDeskGate();
  if (gate.status === "signed-out") {
    return { ok: false, error: describeDeskError({ status: 401 }) };
  }
  if (gate.status === "refused" || !gate.permissions.read) {
    return {
      ok: false,
      error: describeDeskError({
        data: { detail: "Your account cannot read the impact matrix." },
        status: 403,
      }),
    };
  }
  const parsed = suggestInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        items: parsed.error.issues.map((issue) => issue.message),
        kind: "validation",
        status: null,
        title: "Choose a hazard, a likelihood and an impact.",
      },
    };
  }
  try {
    const suggestion = await suggestIbf(gate.accessToken, parsed.data);
    return { ok: true, suggestion };
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status >= 500) reportError(error, "cap-desk-matrix");
    return {
      ok: false,
      error: describeDeskError({
        data: { detail: error.detail },
        status: error.status,
      }),
    };
  }
}
