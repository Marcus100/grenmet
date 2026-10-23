"use server";

import {
  type MembershipGrantPublic,
  organisationsDeleteMember,
  organisationsGrantMemberRole,
  organisationsListIssuedGrants,
  organisationsRevokeMemberGrant,
  ResponseError,
} from "@barrelsgd/api-client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiOptions } from "@/lib/api";
import { reportError } from "@/lib/report-error";
import {
  COULDNT_CONFIRM_TEAM,
  expiryFromDate,
  friendlyTeamError,
  isOpaqueId,
  isRoleKey,
} from "@/lib/team-roles";
import { type ActionResult, SIGN_IN_REQUIRED } from "./action-result";
import { type OrgContext, resolveOrgContext } from "./org-context";

/**
 * Team and roles actions. Each one re-checks the session and resolves the
 * organisation on the server from the member's own organiser workspace; the
 * browser sends only the id of the member or grant being changed (format
 * checked here, authority checked by FastAPI) and the form fields. Errors that
 * are not an expected 4xx go to Sentry with an area tag and no personal data.
 */
const NO_ORGANISATION =
  "This organiser isn't linked to an organisation yet, so the team can't be managed here.";
const CHECK_FORM = "Check the choices and try again.";

const opaqueId = z.string().refine(isOpaqueId);
const roleKey = z.string().refine(isRoleKey);

function refuse(error: string): { error: string; ok: false } {
  return { ok: false, error };
}

function detailOf(error: ResponseError): string | null {
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null || !("detail" in data)) {
    return null;
  }
  const { detail } = data;
  return typeof detail === "string" ? detail : null;
}

function failureOf(error: unknown): { error: string; ok: false } {
  if (error instanceof ResponseError && error.status === 401) {
    return refuse(SIGN_IN_REQUIRED);
  }
  if (
    error instanceof ResponseError &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return refuse(friendlyTeamError(error.status, detailOf(error)));
  }
  reportError(error, "events-team");
  return refuse(COULDNT_CONFIRM_TEAM);
}

async function run<T>(
  call: (
    options: ReturnType<typeof apiOptions> & {
      headers: { "X-Barrels-Organisation": string };
    },
    organisationId: string
  ) => Promise<T>
): Promise<ActionResult<T>> {
  const context: OrgContext = await resolveOrgContext();
  if (!context.ok) {
    return context.reason === "signed-out"
      ? refuse(SIGN_IN_REQUIRED)
      : refuse(NO_ORGANISATION);
  }
  try {
    const data = await call(
      {
        ...apiOptions(context.accessToken),
        headers: { "X-Barrels-Organisation": context.organisationId },
      },
      context.organisationId
    );
    revalidatePath("/dash/team");
    return { ok: true, data };
  } catch (error) {
    return failureOf(error);
  }
}

const grantInput = z.object({
  membershipId: opaqueId,
  roleKey,
  // Empty string = no expiry; otherwise a calendar day in UTC.
  expiresOn: z.string().max(10),
});

/** Gives a member a role bundle, optionally until the end of a UTC day. */
export async function grantRole(
  input: z.input<typeof grantInput>
): Promise<ActionResult<MembershipGrantPublic>> {
  const parsed = grantInput.safeParse(input);
  if (!parsed.success) {
    return refuse(CHECK_FORM);
  }
  const expiry = expiryFromDate(parsed.data.expiresOn, new Date());
  if (!expiry.ok) {
    return refuse(expiry.error);
  }
  const { membershipId, roleKey: role } = parsed.data;
  return await run(
    async (options) =>
      await organisationsGrantMemberRole({
        ...options,
        path: { membership_id: membershipId },
        body: { role_key: role, expires_at: expiry.iso },
      }).unwrap()
  );
}

const revokeInput = z.object({ grantId: opaqueId });

/** Takes a role away from a member. Roles they passed on stay (not transitive). */
export async function revokeGrant(
  input: z.input<typeof revokeInput>
): Promise<ActionResult<MembershipGrantPublic>> {
  const parsed = revokeInput.safeParse(input);
  if (!parsed.success) {
    return refuse(CHECK_FORM);
  }
  const { grantId } = parsed.data;
  return await run(
    async (options) =>
      await organisationsRevokeMemberGrant({
        ...options,
        path: { grant_id: grantId },
      }).unwrap()
  );
}

const memberInput = z.object({ membershipId: opaqueId });

/** Live roles a member handed out; removing them revokes these. Admins only. */
export async function loadIssuedGrants(
  input: z.input<typeof memberInput>
): Promise<ActionResult<MembershipGrantPublic[]>> {
  const parsed = memberInput.safeParse(input);
  if (!parsed.success) {
    return refuse(CHECK_FORM);
  }
  const { membershipId } = parsed.data;
  const context = await resolveOrgContext();
  if (!context.ok) {
    return context.reason === "signed-out"
      ? refuse(SIGN_IN_REQUIRED)
      : refuse(NO_ORGANISATION);
  }
  try {
    const data = await organisationsListIssuedGrants({
      ...apiOptions(context.accessToken),
      headers: { "X-Barrels-Organisation": context.organisationId },
      path: { membership_id: membershipId },
    }).unwrap();
    return { ok: true, data };
  } catch (error) {
    return failureOf(error);
  }
}

/** Ends a membership (owners and admins). The API revokes roles they issued. */
export async function removeMember(
  input: z.input<typeof memberInput>
): Promise<ActionResult<void>> {
  const parsed = memberInput.safeParse(input);
  if (!parsed.success) {
    return refuse(CHECK_FORM);
  }
  const { membershipId } = parsed.data;
  return await run(async (options, organisationId) => {
    await organisationsDeleteMember({
      ...options,
      path: { organisation_id: organisationId, membership_id: membershipId },
    }).unwrap();
  });
}
