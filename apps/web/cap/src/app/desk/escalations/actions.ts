"use server";

import { capEscalationCreateSchema } from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import { z } from "zod";
import { isEditable } from "@/lib/desk/allowed-actions";
import { getAlert, raiseEscalation } from "@/lib/desk/api";
import { type DeskError, describeDeskError } from "@/lib/desk/errors";
import { WARNING_COLOURS } from "@/lib/desk/escalations";
import { getDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export type RaiseOutcome =
  | { ok: true; alertId: string; editable: boolean }
  | { ok: false; error: DeskError };

const raiseInput = z.object({
  awarenessLevel: z.enum(WARNING_COLOURS),
  overrideReason: z.string().max(1000).nullable().optional(),
  productId: z.uuid(),
  revision: z.number().int().min(1),
});

function invalidInput(issues: readonly { message: string }[]): RaiseOutcome {
  return {
    ok: false,
    error: {
      items: issues.map((issue) => issue.message),
      kind: "validation",
      status: null,
      title: "The GMS alert could not be raised as it is. Reload the page.",
    },
  };
}

/**
 * Whether the forecaster can open the editor after a raise. A new draft can be
 * edited. An existing warning can be edited only when the desk still offers it:
 * an in-force (published) warning is read-only. If its state cannot be read, the
 * read view is the safe choice: it never offers an edit that may be refused.
 */
async function editableAfterRaise(
  accessToken: string,
  result: { alert_id: string; created: boolean }
): Promise<boolean> {
  if (result.created) return true;
  try {
    return isEditable(await getAlert(accessToken, result.alert_id));
  } catch (error) {
    // Any failure (network, timeout, parse) lands on the read view: the raise
    // already succeeded, so the forecaster must not see error.tsx for it.
    reportError(error, "cap-desk-escalations");
    return false;
  }
}

/**
 * Raises one saved GMS alert to a CAP warning draft. The API creates the draft
 * (or returns the open one that already exists) and never submits, approves,
 * publishes or sends it. The caller opens the editor or the read view.
 */
export async function raiseToWarningAction(
  input: unknown
): Promise<RaiseOutcome> {
  const gate = await getDeskGate();
  if (gate.status === "signed-out") {
    return { ok: false, error: describeDeskError({ status: 401 }) };
  }
  if (gate.status === "refused" || !gate.permissions.create) {
    return {
      ok: false,
      error: describeDeskError({
        data: { detail: "Your account cannot raise GMS alerts to warnings." },
        status: 403,
      }),
    };
  }
  const parsed = raiseInput.safeParse(input);
  if (!parsed.success) {
    return invalidInput(parsed.error.issues);
  }
  const reason = (parsed.data.overrideReason ?? "").trim();
  const body = capEscalationCreateSchema.safeParse({
    awareness_level: parsed.data.awarenessLevel,
    override_reason: reason === "" ? null : reason,
    product_id: parsed.data.productId,
    revision: parsed.data.revision,
  });
  if (!body.success) {
    return invalidInput(body.error.issues);
  }
  try {
    const result = await raiseEscalation(gate.accessToken, body.data);
    return {
      alertId: result.alert_id,
      editable: await editableAfterRaise(gate.accessToken, result),
      ok: true,
    };
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status >= 500) reportError(error, "cap-desk-escalations");
    return {
      ok: false,
      error: describeDeskError({
        data: { detail: error.detail },
        status: error.status,
      }),
    };
  }
}
