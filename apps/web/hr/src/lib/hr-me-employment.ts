import "server-only";

import {
  type HrMeEmploymentPublic,
  hrGetMyEmploymentStatus200Schema,
} from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";
import { reportError } from "@/lib/report-error";

export type EmploymentLoad =
  | { ok: true; employment: HrMeEmploymentPublic }
  /** No live employment in this organisation. Expected, not reported. Same wording as an empty record. */
  | { ok: false; reason: "not-employed" }
  /** The API refused the read. Shown as "no access", not as an empty record. Expected, not reported. */
  | { ok: false; reason: "not-granted" }
  /** Any other failure. Never shown as an empty record. */
  | { ok: false; reason: "unavailable" };

/**
 * The signed-in person's own employment in one organisation, with their leave
 * balances. The caller must have validated `organisationId` against their own
 * organisation list first (see `resolveOrganisationAccess`); the API then reads
 * only their own record.
 */
export async function loadMyEmployment(
  accessToken: string,
  organisationId: string
): Promise<EmploymentLoad> {
  try {
    const employment = await authApiFetch(
      getAuthConfig(),
      `/hr/me/employment?${new URLSearchParams({ organisation_id: organisationId })}`,
      {
        parse: (payload: unknown) =>
          hrGetMyEmploymentStatus200Schema.parse(payload),
      },
      { accessToken }
    );
    return { ok: true, employment };
  } catch (error) {
    if (isAuthApiError(error)) {
      if (error.status === 404) {
        return { ok: false, reason: "not-employed" };
      }
      if (error.status === 403) {
        return { ok: false, reason: "not-granted" };
      }
    }
    reportError(error, "hr-me-employment");
    return { ok: false, reason: "unavailable" };
  }
}
