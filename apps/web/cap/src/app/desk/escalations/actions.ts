"use server";

import { capEscalationCreateSchema } from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import { z } from "zod";
import { raiseEscalation } from "@/lib/desk/api";
import { type DeskError, describeDeskError } from "@/lib/desk/errors";
import { WARNING_COLOURS } from "@/lib/desk/escalations";
import { getDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export type RaiseOutcome =
  | { ok: true; alertId: string; created: boolean }
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
 * Raises one saved GMS alert to a CAP warning draft. The API creates the draft
 * (or returns the open one that already exists) and never submits, approves,
 * publishes or sends it. The caller then opens the draft's edit page.
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
    return { alertId: result.alert_id, created: result.created, ok: true };
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
