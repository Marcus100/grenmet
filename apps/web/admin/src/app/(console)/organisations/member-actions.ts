"use server";

import { isAuthApiError } from "@barrelsgd/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addOrganisationMember,
  removeOrganisationMember,
  updateOrganisationMember,
} from "@/lib/api";
import {
  type MemberAction,
  type MemberNoticeCode,
  memberNoticeForError,
  parseMemberAdd,
  parseMemberRemove,
  parseMemberRole,
  parseMembershipId,
} from "@/lib/member-form";
import { parseOrganisationId } from "@/lib/organisation-form";
import { reportError } from "@/lib/report-error";
import { requireGate } from "@/lib/staff-gate";

// Like organisations/actions.ts: re-check the staff gate, validate, proxy to
// FastAPI (which re-checks superuser and authenticator and owns every rule) and
// redirect with a fixed notice code. The bearer token never leaves the server.

function detailPath(id: string): `/organisations/${string}` {
  return `/organisations/${encodeURIComponent(id)}`;
}

async function staffToken(returnTo: string): Promise<string> {
  const gate = await requireGate(returnTo);
  if (gate.status !== "staff") redirect("/");
  return gate.accessToken;
}

function target(formData: FormData): string {
  const id = parseOrganisationId(String(formData.get("organisation_id") ?? ""));
  if (!id) redirect("/organisations");
  return id;
}

async function perform(
  id: string,
  action: MemberAction,
  success: MemberNoticeCode,
  run: () => Promise<unknown>
): Promise<never> {
  let notice: MemberNoticeCode = success;
  try {
    await run();
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status === 401) redirect("/signin?sign_in=expired");
    const mapped = memberNoticeForError(action, error.status, error.detail);
    // Expected refusals are not incidents; anything else is reported.
    if (!mapped.known) reportError(error, "admin-members");
    notice = mapped.code;
  }
  revalidatePath(detailPath(id));
  redirect(`${detailPath(id)}?notice=${notice}#members-heading`);
}

function invalid(id: string): Promise<never> {
  revalidatePath(detailPath(id));
  redirect(`${detailPath(id)}?notice=member-invalid#members-heading`);
}

export async function addMemberAction(formData: FormData): Promise<never> {
  const id = target(formData);
  const token = await staffToken(detailPath(id));
  const parsed = parseMemberAdd(formData);
  if (!parsed.ok) return invalid(id);
  return await perform(id, "add", "member-added", () =>
    addOrganisationMember(token, id, parsed.value)
  );
}

export async function changeMemberRoleAction(
  formData: FormData
): Promise<never> {
  const id = target(formData);
  const token = await staffToken(detailPath(id));
  const membershipId = parseMembershipId(
    String(formData.get("membership_id") ?? "")
  );
  const parsed = parseMemberRole(formData);
  if (!(membershipId && parsed.ok)) return invalid(id);
  return await perform(id, "change", "member-changed", () =>
    updateOrganisationMember(token, id, membershipId, parsed.value)
  );
}

export async function removeMemberAction(formData: FormData): Promise<never> {
  const id = target(formData);
  const token = await staffToken(detailPath(id));
  const membershipId = parseMembershipId(
    String(formData.get("membership_id") ?? "")
  );
  const parsed = parseMemberRemove(formData);
  if (!(membershipId && parsed.ok)) return invalid(id);
  return await perform(id, "remove", "member-removed", () =>
    removeOrganisationMember(token, id, membershipId, parsed.value)
  );
}
