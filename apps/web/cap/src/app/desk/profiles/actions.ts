"use server";

import type { CapProfilePublic } from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import { z } from "zod";
import { approveHazardProfile } from "@/lib/desk/api";
import { type DeskError, describeDeskError } from "@/lib/desk/errors";
import { getDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export type ProfileApprovalOutcome =
  | { ok: true; profile: CapProfilePublic }
  | { ok: false; error: DeskError };

const approvalInput = z.object({ profileId: z.uuid() });

/**
 * Approves one hazard profile version. Approved profiles drive severity rules
 * for new warnings, so the caller must have confirmed in the dialog first; the
 * server also needs both library and approval access. FastAPI enforces the
 * rules again, including that the reviewer is not the author.
 */
export async function approveHazardProfileAction(
  input: unknown
): Promise<ProfileApprovalOutcome> {
  const gate = await getDeskGate();
  if (gate.status === "signed-out") {
    return { ok: false, error: describeDeskError({ status: 401 }) };
  }
  if (
    gate.status === "refused" ||
    !(gate.permissions.libraryManage && gate.permissions.approve)
  ) {
    return {
      ok: false,
      error: describeDeskError({
        data: { detail: "Your account cannot approve hazard profiles." },
        status: 403,
      }),
    };
  }
  const parsed = approvalInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        items: ["The profile to approve was not recognised. Reload the page."],
        kind: "state",
        status: null,
        title: "This profile cannot be approved.",
      },
    };
  }
  try {
    const profile = await approveHazardProfile(
      gate.accessToken,
      parsed.data.profileId
    );
    return { ok: true, profile };
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status >= 500) reportError(error, "cap-desk-profiles");
    return {
      ok: false,
      error: describeDeskError({
        data: { detail: error.detail },
        status: error.status,
      }),
    };
  }
}
