import "server-only";
import type { OrganisationPublic } from "@barrelsgd/api-client";
import {
  loadEffectiveAccess,
  loadOrganisations,
  payrollSecurityUrl,
} from "./load-payroll";
import type { PayrollAccess } from "./payroll-access";

/** Which organisation a payroll page is about, and what the person may do there. */
export type PayrollScope =
  | { state: "none" }
  | { state: "choose"; organisations: OrganisationPublic[] }
  | {
      state: "ready";
      organisationId: string;
      access: PayrollAccess;
      securityUrl: string;
    };

/** One organisation is used directly; several need the `org` query parameter. */
export async function resolvePayrollScope(
  org: string | undefined
): Promise<PayrollScope> {
  const orgs = await loadOrganisations();
  if (orgs.state !== "ready" || orgs.data.length === 0) {
    return { state: "none" };
  }
  const requested =
    org && orgs.data.some((item) => item.id === org) ? org : undefined;
  const organisationId =
    requested ?? (orgs.data.length === 1 ? orgs.data[0]?.id : undefined);
  if (!organisationId) {
    return { state: "choose", organisations: orgs.data };
  }
  const { access } = await loadEffectiveAccess();
  return {
    state: "ready",
    organisationId,
    access,
    securityUrl: payrollSecurityUrl(),
  };
}
