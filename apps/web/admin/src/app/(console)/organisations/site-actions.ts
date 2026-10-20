"use server";

import { isAuthApiError } from "@barrelsgd/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSite, listOrganisationSites, updateSite } from "@/lib/api";
import { parseOrganisationId } from "@/lib/organisation-form";
import { reportError } from "@/lib/report-error";
import {
  parseSiteCreate,
  parseSiteId,
  parseSiteUpdate,
  type SiteNoticeCode,
  siteNoticeForStatus,
} from "@/lib/site-form";
import { requireGate } from "@/lib/staff-gate";

// Like organisations/actions.ts: validate, proxy to FastAPI (which re-checks
// superuser and owns the rules) and redirect with a fixed notice code. The
// Turnstile secret only travels from the form to the API; it is never put in a
// redirect, a log line or an error report.

const SERVER_ERROR = 500;

async function staffToken(returnTo: string): Promise<string> {
  const gate = await requireGate(returnTo);
  if (gate.status !== "staff") redirect("/");
  return gate.accessToken;
}

function detailPath(id: string): `/organisations/${string}` {
  return `/organisations/${encodeURIComponent(id)}`;
}

function target(formData: FormData): string {
  const id = parseOrganisationId(String(formData.get("organisation_id") ?? ""));
  if (!id) redirect("/organisations");
  return id;
}

async function perform(
  id: string,
  success: SiteNoticeCode,
  run: () => Promise<unknown>
): Promise<never> {
  let notice: SiteNoticeCode = success;
  try {
    await run();
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status === 401) redirect("/signin?sign_in=expired");
    // 503 is an operator-facing condition (no secret storage); report it too.
    if (error.status >= SERVER_ERROR) reportError(error, "admin-sites");
    notice = siteNoticeForStatus(error.status);
  }
  revalidatePath(detailPath(id));
  redirect(`${detailPath(id)}?notice=${notice}#sites-heading`);
}

export async function createSiteAction(formData: FormData): Promise<never> {
  const id = target(formData);
  const token = await staffToken(detailPath(id));
  const parsed = parseSiteCreate(formData, id);
  if (!parsed.ok)
    redirect(`${detailPath(id)}?notice=site-invalid#sites-heading`);
  return await perform(id, "site-created", () =>
    createSite(token, parsed.value)
  );
}

async function currentSite(
  token: string,
  organisationId: string,
  siteId: string
) {
  const { data } = await listOrganisationSites(token, organisationId);
  return data.find((site) => site.id === siteId);
}

export async function updateSiteAction(formData: FormData): Promise<never> {
  const id = target(formData);
  const siteId = parseSiteId(String(formData.get("site_id") ?? ""));
  const token = await staffToken(detailPath(id));
  if (!siteId) redirect(`${detailPath(id)}?notice=site-invalid#sites-heading`);
  return await perform(id, "site-updated", async () => {
    // Diff against the stored site so only changed fields are sent.
    const current = await currentSite(token, id, siteId);
    if (!current)
      redirect(`${detailPath(id)}?notice=site-invalid#sites-heading`);
    const parsed = parseSiteUpdate(formData, current);
    if (!parsed.ok) {
      redirect(`${detailPath(id)}?notice=site-invalid#sites-heading`);
    }
    if (Object.keys(parsed.value).length === 0) {
      redirect(`${detailPath(id)}?notice=site-unchanged#sites-heading`);
    }
    await updateSite(token, siteId, parsed.value);
  });
}

export async function clearSiteSecretAction(
  formData: FormData
): Promise<never> {
  const id = target(formData);
  const siteId = parseSiteId(String(formData.get("site_id") ?? ""));
  const token = await staffToken(detailPath(id));
  if (!siteId) redirect(`${detailPath(id)}?notice=site-invalid#sites-heading`);
  return await perform(id, "secret-cleared", () =>
    updateSite(token, siteId, { turnstile_secret: null })
  );
}
