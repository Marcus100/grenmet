import "server-only";

import { cache } from "react";
import { getManagedOrganiser } from "@/data/events-api";
import { getSession } from "@/lib/session";

export type OrgContext =
  | {
      readonly accessToken: string;
      readonly ok: true;
      readonly organisationId: string;
    }
  | { readonly ok: false; readonly reason: "no-organisation" | "signed-out" };

/**
 * The organisation the signed-in member is acting for, resolved on the server
 * from their own organiser workspace (the `events_organiser` choice). Ids from
 * the browser are never used for this.
 */
export const resolveOrgContext = cache(async (): Promise<OrgContext> => {
  const session = await getSession();
  if (!session) {
    return { ok: false, reason: "signed-out" };
  }
  const managed = await getManagedOrganiser();
  const organisationId = managed?.organiser.organisationId ?? null;
  if (!organisationId) {
    return { ok: false, reason: "no-organisation" };
  }
  return { ok: true, accessToken: session.accessToken, organisationId };
});
