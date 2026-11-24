import "server-only";

import {
  type GradeSetup,
  hrGetSetupGradesStatus200Schema,
  hrGetStaffSetupStatus200Schema,
  type StaffSetup,
} from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";
import { reportError } from "@/lib/report-error";

export type StaffLoad =
  | { ok: true; staff: StaffSetup[] }
  /** FastAPI refused: the person is not an HR administrator for this organisation. Expected, not reported. */
  | { ok: false; reason: "not-admin" }
  /** The organisation is not one the API will show this person. Same wording as a foreign slug. */
  | { ok: false; reason: "not-found" }
  /** Any other failure. Never shown as an empty list. */
  | { ok: false; reason: "unavailable" };

/**
 * The staff list for one organisation, read with the person's app token. The
 * API decides who may see it (`hr.setup.manage` through a live assignment in
 * that organisation); this app only shows what comes back.
 */
export async function loadOrganisationStaff(
  accessToken: string,
  organisationId: string
): Promise<StaffLoad> {
  try {
    const staff = await authApiFetch(
      getAuthConfig(),
      `/hr/setup/staff?${new URLSearchParams({ organisation_id: organisationId })}`,
      {
        parse: (payload: unknown) =>
          hrGetStaffSetupStatus200Schema.parse(payload),
      },
      { accessToken }
    );
    return { ok: true, staff };
  } catch (error) {
    if (isAuthApiError(error)) {
      if (error.status === 403) {
        return { ok: false, reason: "not-admin" };
      }
      if (error.status === 404) {
        return { ok: false, reason: "not-found" };
      }
    }
    reportError(error, "hr-staff");
    return { ok: false, reason: "unavailable" };
  }
}

export type GradesLoad =
  | { ok: true; grades: GradeSetup[] }
  /** Same gate as the staff list (`hr.setup.manage`). Expected, not reported. */
  | { ok: false; reason: "not-admin" }
  /** The organisation is not one the API will show this person. Expected, not reported. */
  | { ok: false; reason: "not-found" }
  /** Any other failure. Never shown as an empty list. */
  | { ok: false; reason: "unavailable" };

/**
 * The grade definitions of one organisation, used to name a staff member's
 * grade on the detail page. Same API gate as `loadOrganisationStaff`; a failure
 * here must not hide the rest of the staff record.
 */
export async function loadOrganisationGrades(
  accessToken: string,
  organisationId: string
): Promise<GradesLoad> {
  try {
    const grades = await authApiFetch(
      getAuthConfig(),
      `/hr/setup/grades?${new URLSearchParams({ organisation_id: organisationId })}`,
      {
        parse: (payload: unknown) =>
          hrGetSetupGradesStatus200Schema.parse(payload),
      },
      { accessToken }
    );
    return { ok: true, grades };
  } catch (error) {
    if (isAuthApiError(error)) {
      if (error.status === 403) {
        return { ok: false, reason: "not-admin" };
      }
      if (error.status === 404) {
        return { ok: false, reason: "not-found" };
      }
    }
    reportError(error, "hr-staff-grades");
    return { ok: false, reason: "unavailable" };
  }
}
