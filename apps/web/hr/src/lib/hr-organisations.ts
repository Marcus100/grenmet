import "server-only";

import {
  type HrMeOrganisationPublic,
  hrGetMyOrganisationsStatus200Schema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";
import { reportError } from "@/lib/report-error";

export type OrganisationLoad =
  | { ok: true; organisations: HrMeOrganisationPublic[] }
  | { ok: false };

/**
 * The organisations the signed-in staff member can route to, read with their
 * app token. The list is theirs alone: FastAPI decides it from live employment
 * and role assignments, so an empty list means "no access", not an error.
 */
export function fetchMyOrganisations(
  accessToken: string
): Promise<HrMeOrganisationPublic[]> {
  return authApiFetch(
    getAuthConfig(),
    "/hr/me/organisations",
    {
      parse: (payload: unknown) =>
        hrGetMyOrganisationsStatus200Schema.parse(payload),
    },
    { accessToken }
  );
}

/**
 * Wraps the read for pages. A failure is shown as "could not load" (never as an
 * empty list) and reported, so an outage cannot look like no access.
 */
export async function loadMyOrganisations(
  accessToken: string
): Promise<OrganisationLoad> {
  try {
    return { ok: true, organisations: await fetchMyOrganisations(accessToken) };
  } catch (error) {
    reportError(error, "hr-organisations");
    return { ok: false };
  }
}
