"use server";

import {
  type InvitationPublic,
  invitationCreateSchema,
  type MembershipGrantPublic,
  organisationsCreateInvitation,
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
import { detailOfData } from "./validation-detail";

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
  return detailOfData(error.data);
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
    options: Awaited<ReturnType<typeof apiOptions>> & {
      headers: { "X-Barrels-Organisation": string };
    },
    organisationId: string
  ) => Promise<T>,
  onFailure: (error: unknown) => { error: string; ok: false } = failureOf
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
        ...(await apiOptions(context.accessToken)),
        headers: { "X-Barrels-Organisation": context.organisationId },
      },
      context.organisationId
    );
    revalidatePath("/dash/team");
    return { ok: true, data };
  } catch (error) {
    return onFailure(error);
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
      ...(await apiOptions(context.accessToken)),
      headers: { "X-Barrels-Organisation": context.organisationId },
      path: { membership_id: membershipId },
    }).unwrap();
    return { ok: true, data };
  } catch (error) {
    return failureOf(error);
  }
}

/**
 * What a removal ended. From this Events app it is always "events": only the
 * person's Events access in this organisation (the API answers 200 with
 * `scope: "events"`). "organisation" is a 204, a full removal.
 */
export type MemberRemovalScope = "events" | "organisation";

function removalScope(body: unknown): MemberRemovalScope {
  return typeof body === "object" &&
    body !== null &&
    "scope" in body &&
    body.scope === "events"
    ? "events"
    : "organisation";
}

/** Ends a person's access (owners and admins). The API revokes roles they issued. */
export async function removeMember(
  input: z.input<typeof memberInput>
): Promise<ActionResult<MemberRemovalScope>> {
  const parsed = memberInput.safeParse(input);
  if (!parsed.success) {
    return refuse(CHECK_FORM);
  }
  const { membershipId } = parsed.data;
  return await run(async (options, organisationId) => {
    const body: unknown = await organisationsDeleteMember({
      ...options,
      path: { organisation_id: organisationId, membership_id: membershipId },
    }).unwrap();
    return removalScope(body);
  });
}

const INVITE_FALLBACK =
  "We couldn't send that invitation. Check the address and the role, then try again.";
const INVITE_UNKNOWN = "We couldn't send that invitation. Try again shortly.";

/**
 * An invitation refusal shows the API's own sentence (for example "already a
 * member"), because the Events screen has no wording of its own for it. Other
 * faults go to Sentry and show a generic line.
 */
function inviteFailureOf(error: unknown): { error: string; ok: false } {
  if (error instanceof ResponseError && error.status === 401) {
    return refuse(SIGN_IN_REQUIRED);
  }
  if (
    error instanceof ResponseError &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return refuse(detailOf(error) ?? INVITE_FALLBACK);
  }
  reportError(error, "events-team");
  return refuse(INVITE_UNKNOWN);
}

/**
 * Emails a single-use invitation link. Admins invite members and admins; only
 * owners invite owners (the API decides, and its refusal is shown as sent).
 * Nothing is logged about the invitee: the address is personal data.
 */
export async function inviteMember(
  input: z.input<typeof invitationCreateSchema>
): Promise<ActionResult<InvitationPublic>> {
  const parsed = invitationCreateSchema.safeParse(input);
  if (!parsed.success) {
    return refuse(CHECK_FORM);
  }
  const body = parsed.data;
  return await run(
    async (options, organisationId) =>
      await organisationsCreateInvitation({
        ...options,
        path: { organisation_id: organisationId },
        body,
      }).unwrap(),
    inviteFailureOf
  );
}
