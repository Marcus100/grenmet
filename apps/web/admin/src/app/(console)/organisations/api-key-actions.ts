"use server";

import { isAuthApiError } from "@barrelsgd/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revokeApiKey } from "@/lib/api";
import { type ApiKeyNoticeCode, parseApiKeyId } from "@/lib/api-key-form";
import { parseOrganisationId } from "@/lib/organisation-form";
import { reportError } from "@/lib/report-error";
import { requireGate } from "@/lib/staff-gate";

// Revoke only. Creating and rotating keys is an organisation-admin action
// (org zone) because the one-time secret must go to that admin, not to staff.

const NOT_FOUND = 404;

function detailPath(id: string): `/organisations/${string}` {
  return `/organisations/${encodeURIComponent(id)}`;
}

export async function revokeApiKeyAction(formData: FormData): Promise<never> {
  const id = parseOrganisationId(String(formData.get("organisation_id") ?? ""));
  if (!id) redirect("/organisations");
  const gate = await requireGate(detailPath(id));
  if (gate.status !== "staff") redirect("/");
  const keyId = parseApiKeyId(String(formData.get("key_id") ?? ""));
  let notice: ApiKeyNoticeCode = "key-revoked";
  if (keyId) {
    try {
      await revokeApiKey(gate.accessToken, keyId);
    } catch (error) {
      if (!isAuthApiError(error)) throw error;
      if (error.status === 401) redirect("/signin?sign_in=expired");
      if (error.status === NOT_FOUND) {
        notice = "key-missing";
      } else {
        reportError(error, "admin-api-keys");
        notice = "key-failed";
      }
    }
  } else {
    notice = "key-missing";
  }
  revalidatePath(detailPath(id));
  redirect(`${detailPath(id)}?notice=${notice}#api-keys-heading`);
}
