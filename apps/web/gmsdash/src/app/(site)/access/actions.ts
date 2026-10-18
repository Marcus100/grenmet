"use server";

import { redirect } from "next/navigation";
import { GuidanceApiError, requestAccess } from "@/lib/api";
import { requireSession } from "@/lib/session";

/** Fixed codes only: the query string never carries free text back. */
export async function requestAccessAction(formData: FormData): Promise<void> {
  const organisationId = String(formData.get("organisation") ?? "").trim();
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 500);
  const session = await requireSession("/access");
  if (!organisationId) redirect("/access?notice=error");

  let notice = "requested";
  try {
    await requestAccess(session.accessToken, organisationId, note);
  } catch (error) {
    if (!(error instanceof GuidanceApiError)) throw error;
    if (error.status === 409) notice = "duplicate";
    else if (error.status === 403) notice = "forbidden";
    else if (error.status === 404) notice = "error";
    else throw error;
  }
  redirect(
    `/access?org=${encodeURIComponent(organisationId)}&notice=${notice}`
  );
}
