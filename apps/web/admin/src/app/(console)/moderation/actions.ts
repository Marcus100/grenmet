"use server";

import { isAuthApiError } from "@barrelsgd/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { decideVerificationCase } from "@/lib/moderation-api";
import {
  type ModerationDecision,
  type ModerationNoticeCode,
  moderationNoticeForError,
  parseModerationId,
  parseReason,
} from "@/lib/moderation-form";
import { reportError } from "@/lib/report-error";
import { requireGate } from "@/lib/staff-gate";

// Re-check the staff gate, validate the path id and reason, proxy to FastAPI
// (which re-checks superuser + authenticator and owns every state rule). A
// success redirects to the case with a fixed notice code; a refusal returns the
// code to the form. Decisions are transitions: a repeat is a 409, never a retry.

export interface ModerationFormState {
  code?: ModerationNoticeCode;
  reason?: string;
}

function casePath(id: string): `/moderation/${string}` {
  return `/moderation/${encodeURIComponent(id)}`;
}

async function decide(
  decision: ModerationDecision,
  formData: FormData
): Promise<ModerationFormState> {
  const id = parseModerationId(String(formData.get("organisation_id") ?? ""));
  if (!id) redirect("/moderation");
  const gate = await requireGate(casePath(id));
  if (gate.status !== "staff") redirect("/");

  const rawReason = String(formData.get("reason") ?? "");
  const parsed = parseReason(decision, rawReason);
  if (!parsed.ok) return { code: "invalid", reason: rawReason };

  try {
    await decideVerificationCase(gate.accessToken, id, decision, parsed.value);
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status === 401) redirect("/signin?sign_in=expired");
    const mapped = moderationNoticeForError(error.status, error.detail);
    // Expected refusals are not incidents; anything else is reported.
    if (!mapped.known) reportError(error, "admin-moderation");
    revalidatePath(casePath(id));
    return { code: mapped.code, reason: rawReason };
  }
  revalidatePath(casePath(id));
  revalidatePath("/moderation");
  redirect(
    `${casePath(id)}?notice=${decision === "approve" ? "approved" : "rejected"}`
  );
}

export async function approveAction(
  _previous: ModerationFormState,
  formData: FormData
): Promise<ModerationFormState> {
  return await decide("approve", formData);
}

export async function rejectAction(
  _previous: ModerationFormState,
  formData: FormData
): Promise<ModerationFormState> {
  return await decide("reject", formData);
}
