import "server-only";

import type { HrMeOrganisationPublic } from "@barrelsgd/api-client";
import { loadMyOrganisations } from "@/lib/hr-organisations";

/**
 * What the signed-in person may do with one organisation slug in the path.
 * Every organisation page goes through `resolveOrganisationAccess`, so the slug
 * is only ever honoured when it is in this person's own list.
 */
export type OrganisationAccess =
  /** The slug is one of the person's own organisations. */
  | {
      state: "granted";
      organisation: HrMeOrganisationPublic;
      organisations: HrMeOrganisationPublic[];
    }
  /** The person has no HR organisations at all (not an error). */
  | { state: "no-access" }
  /** The person has organisations, but not this slug. Missing and forbidden look the same. */
  | { state: "not-granted"; organisations: HrMeOrganisationPublic[] }
  /** The organisation list could not be read. Never shown as "no access". */
  | { state: "unavailable" };

export async function resolveOrganisationAccess(
  accessToken: string,
  orgSlug: string
): Promise<OrganisationAccess> {
  const load = await loadMyOrganisations(accessToken);
  if (!load.ok) {
    return { state: "unavailable" };
  }
  if (load.organisations.length === 0) {
    return { state: "no-access" };
  }
  const organisation = load.organisations.find(
    (candidate) => candidate.slug === orgSlug
  );
  if (!organisation) {
    return { state: "not-granted", organisations: load.organisations };
  }
  return {
    state: "granted",
    organisation,
    organisations: load.organisations,
  };
}
