"use server";

import { isAuthApiError } from "@barrelsgd/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createOrganisation,
  decideVerification,
  setAppEntitlement,
  updateOrganisation,
} from "@/lib/api";
import {
  type NoticeCode,
  noticeForStatus,
  parseCreate,
  parseEdit,
  parseEntitlement,
  parseOrganisationId,
  parseReason,
  parseStatus,
} from "@/lib/organisation-form";
import { requireGate } from "@/lib/staff-gate";

// Server actions only validate and proxy to FastAPI, which re-checks that the
// caller is a superuser and owns every business rule.

async function staffToken(returnTo: string): Promise<string> {
  const gate = await requireGate(returnTo);
  if (gate.status !== "staff") redirect("/");
  return gate.accessToken;
}

function detailPath(id: string): `/organisations/${string}` {
  return `/organisations/${encodeURIComponent(id)}`;
}

async function perform(
  id: string,
  success: NoticeCode,
  run: () => Promise<unknown>
): Promise<never> {
  let notice: NoticeCode = success;
  try {
    await run();
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status === 401) redirect("/signin?sign_in=expired");
    notice = noticeForStatus(error.status);
  }
  revalidatePath(detailPath(id));
  redirect(`${detailPath(id)}?notice=${notice}`);
}

function target(formData: FormData): string {
  const id = parseOrganisationId(String(formData.get("organisation_id") ?? ""));
  if (!id) redirect("/organisations");
  return id;
}

export async function createOrganisationAction(
  formData: FormData
): Promise<never> {
  const token = await staffToken("/organisations/new");
  const parsed = parseCreate(formData);
  if (!parsed.ok) redirect("/organisations/new?notice=invalid");
  let id: string;
  try {
    id = (await createOrganisation(token, parsed.value)).id;
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status === 401) redirect("/signin?sign_in=expired");
    redirect(`/organisations/new?notice=${noticeForStatus(error.status)}`);
  }
  revalidatePath("/organisations");
  redirect(`${detailPath(id)}?notice=created`);
}

export async function editOrganisationAction(
  formData: FormData
): Promise<never> {
  const id = target(formData);
  const token = await staffToken(detailPath(id));
  const parsed = parseEdit(formData);
  if (!parsed.ok) redirect(`${detailPath(id)}?notice=invalid`);
  return await perform(id, "updated", () =>
    updateOrganisation(token, id, parsed.value)
  );
}

export async function setStatusAction(formData: FormData): Promise<never> {
  const id = target(formData);
  const token = await staffToken(detailPath(id));
  const parsed = parseStatus(formData);
  if (!parsed.ok) redirect(`${detailPath(id)}?notice=invalid`);
  return await perform(
    id,
    parsed.value === "suspended" ? "suspended" : "reactivated",
    () => updateOrganisation(token, id, { status: parsed.value })
  );
}

async function decide(
  formData: FormData,
  decision: "verify" | "unverify"
): Promise<never> {
  const id = target(formData);
  const token = await staffToken(detailPath(id));
  const parsed = parseReason(formData);
  if (!parsed.ok) redirect(`${detailPath(id)}?notice=invalid`);
  return await perform(
    id,
    decision === "verify" ? "verified" : "unverified",
    () => decideVerification(token, id, decision, parsed.value)
  );
}

export async function verifyAction(formData: FormData): Promise<never> {
  return await decide(formData, "verify");
}

export async function unverifyAction(formData: FormData): Promise<never> {
  return await decide(formData, "unverify");
}

export async function setAppAction(formData: FormData): Promise<never> {
  const id = target(formData);
  const token = await staffToken(detailPath(id));
  const parsed = parseEntitlement(formData);
  if (!parsed.ok) redirect(`${detailPath(id)}?notice=invalid`);
  return await perform(id, "app-updated", () =>
    setAppEntitlement(token, id, parsed.value.appKey, parsed.value.enabled)
  );
}
