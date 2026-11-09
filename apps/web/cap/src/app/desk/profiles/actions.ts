"use server";

import {
  type CapAlertPublic,
  type CapProfilePublic,
  capProfileDraftRequestSchema,
  capProfileSaveSchema,
  capSaveHazardProfilePathKeySchema,
} from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import { z } from "zod";
import {
  approveHazardProfile,
  draftAlertFromHazardProfile,
  saveHazardProfileVersion,
} from "@/lib/desk/api";
import { type DeskError, describeDeskError } from "@/lib/desk/errors";
import { getDeskGate } from "@/lib/desk/gate";
import {
  alertStartPermissionCheck,
  versionDraftCheck,
} from "@/lib/desk/profiles";
import { reportError } from "@/lib/report-error";

export type ProfileApprovalOutcome =
  | { ok: true; profile: CapProfilePublic }
  | { ok: false; error: DeskError };

export type ProfileVersionOutcome =
  | { ok: true; profile: CapProfilePublic }
  | { ok: false; error: DeskError };

export type ProfileAlertDraftOutcome =
  | { ok: true; alertId: string }
  | { ok: false; error: DeskError };

const approvalInput = z.object({ profileId: z.uuid() });

const versionInput = z.object({
  baseVersion: z.number().int().min(0),
  definition: z.unknown(),
  key: z.string(),
});

const alertDraftInput = z.object({
  colour: z.string().nullable(),
  level: z.string(),
  profileId: z.uuid(),
  subtype: z.string(),
});

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

/**
 * Saves a new draft version of a hazard profile. Editing never changes an
 * existing version: the result is a new draft that needs approval before any
 * warning can use it. `baseVersion` is the version the editor started from.
 * The request body is checked with the API's own schema before it is sent.
 */
export async function saveHazardProfileVersionAction(
  input: unknown
): Promise<ProfileVersionOutcome> {
  const gate = await getDeskGate();
  if (gate.status === "signed-out") {
    return { ok: false, error: describeDeskError({ status: 401 }) };
  }
  if (gate.status === "refused") {
    return { ok: false, error: describeDeskError({ status: 403 }) };
  }
  const check = versionDraftCheck(gate.permissions);
  if (!check.allowed) {
    return {
      ok: false,
      error: describeDeskError({
        data: { detail: check.reason },
        status: 403,
      }),
    };
  }
  const parsed = versionInput.safeParse(input);
  const key = capSaveHazardProfilePathKeySchema.safeParse(
    parsed.success ? parsed.data.key : ""
  );
  const body = parsed.success
    ? capProfileSaveSchema.safeParse({
        base_version: parsed.data.baseVersion,
        definition: parsed.data.definition,
      })
    : null;
  if (!(parsed.success && key.success && body?.success)) {
    const issues = [
      ...(parsed.success ? [] : parsed.error.issues),
      ...(key.success ? [] : key.error.issues),
      ...(body && !body.success ? body.error.issues : []),
    ];
    return {
      ok: false,
      error: {
        items: issues.map((issue) => issue.message),
        kind: "validation",
        status: null,
        title: "The profile could not be saved as it is.",
      },
    };
  }
  try {
    const profile = await saveHazardProfileVersion(
      gate.accessToken,
      key.data,
      body.data
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

/**
 * Starts a warning draft from one approved profile version. Only a draft is
 * created: it is not submitted, approved, published or sent. The forecaster
 * opens it on the warning page and continues from there.
 */
export async function startAlertDraftFromProfileAction(
  input: unknown
): Promise<ProfileAlertDraftOutcome> {
  const gate = await getDeskGate();
  if (gate.status === "signed-out") {
    return { ok: false, error: describeDeskError({ status: 401 }) };
  }
  if (gate.status === "refused") {
    return { ok: false, error: describeDeskError({ status: 403 }) };
  }
  const parsed = alertDraftInput.safeParse(input);
  const body = parsed.success
    ? capProfileDraftRequestSchema.safeParse({
        colour: parsed.data.colour,
        level: parsed.data.level,
        subtype: parsed.data.subtype,
      })
    : null;
  if (!(parsed.success && body?.success)) {
    return {
      ok: false,
      error: {
        items: [
          "Choose a subtype, a product and, for a warning, a colour. Reload the page if the list is out of date.",
        ],
        kind: "validation",
        status: null,
        title: "The warning draft could not be started.",
      },
    };
  }
  // The API also checks that this version is approved and has the template.
  const check = alertStartPermissionCheck(gate.permissions);
  if (!check.allowed) {
    return {
      ok: false,
      error: describeDeskError({
        data: { detail: check.reason },
        status: 403,
      }),
    };
  }
  try {
    const alert: CapAlertPublic = await draftAlertFromHazardProfile(
      gate.accessToken,
      parsed.data.profileId,
      body.data
    );
    return { ok: true, alertId: alert.id };
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
