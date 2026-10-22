import "server-only";

import {
  type MemberPublic,
  type MembershipGrantPublic,
  organisationsListMemberGrants,
  organisationsListMembers,
  organisationsListRoleBundles,
  ResponseError,
  type RoleBundlePublic,
} from "@barrelsgd/api-client";
import { apiOptions } from "@/lib/api";
import { reportError } from "@/lib/report-error";
import type { OrgContext } from "./org-context";

type Ready = Extract<OrgContext, { ok: true }>;

export const TEAM_PAGE_SIZE = 25;

export interface TeamMember {
  readonly email: string;
  readonly fullName: string;
  /** Null when this member's roles could not be loaded. */
  readonly grants: readonly MembershipGrantPublic[] | null;
  readonly isSelf: boolean;
  readonly membershipId: string;
  readonly role: MemberPublic["role"];
}

export type TeamRead =
  | { readonly kind: "forbidden" }
  | { readonly kind: "not-found" }
  | {
      readonly bundles: readonly RoleBundlePublic[];
      readonly count: number;
      readonly kind: "ok";
      /** Null when the API refuses the roster (only owners and admins read it). */
      readonly members: readonly TeamMember[] | null;
      readonly page: number;
      readonly totalPages: number;
    };

function request(context: Ready) {
  return {
    ...apiOptions(context.accessToken),
    headers: { "X-Barrels-Organisation": context.organisationId },
  };
}

function statusOf(error: unknown): number | null {
  return error instanceof ResponseError ? error.status : null;
}

/**
 * The bundles the caller may see, the roster when the API allows it, and each
 * member's live grants (for the products the caller manages). A 403 on the
 * bundles means the caller holds no team-manage permission; a 403 on the roster
 * only hides the member list. Anything else throws to `error.tsx`.
 */
export async function getTeam(
  context: Ready,
  viewer: { page: number; userId: string }
): Promise<TeamRead> {
  let bundles: RoleBundlePublic[];
  try {
    bundles = (
      await organisationsListRoleBundles(request(context)).unwrap()
    ).filter((bundle) => bundle.product === "events");
  } catch (error) {
    const status = statusOf(error);
    if (status === 403) {
      return { kind: "forbidden" };
    }
    if (status === 404) {
      return { kind: "not-found" };
    }
    throw error;
  }

  let roster: { count: number; data: MemberPublic[]; page: number } | null;
  try {
    const list = await organisationsListMembers({
      ...request(context),
      path: { organisation_id: context.organisationId },
      query: { page: viewer.page, size: TEAM_PAGE_SIZE },
    }).unwrap();
    roster = { count: list.count, data: list.data, page: list.page };
  } catch (error) {
    if (statusOf(error) !== 403) {
      throw error;
    }
    roster = null;
  }

  if (!roster) {
    return {
      kind: "ok",
      bundles,
      members: null,
      count: 0,
      page: 1,
      totalPages: 1,
    };
  }

  const eventsRoles = new Set(bundles.map((bundle) => bundle.role_key));
  const members = await Promise.all(
    roster.data.map(async (member): Promise<TeamMember> => {
      let grants: MembershipGrantPublic[] | null = [];
      try {
        grants = (
          await organisationsListMemberGrants({
            ...request(context),
            path: { membership_id: member.membership_id },
          }).unwrap()
        ).filter((grant) => eventsRoles.has(grant.role_key));
      } catch (error) {
        const status = statusOf(error);
        // A member who left between the two calls simply has no roles to show.
        if (status === 401 || status === 403) {
          throw error;
        }
        if (status !== 404) {
          // One member's failure must not take the page down.
          reportError(error, "events-team");
          grants = null;
        }
      }
      return {
        membershipId: member.membership_id,
        fullName: member.full_name.trim() || "Member",
        email: member.email,
        role: member.role,
        isSelf: member.user_id === viewer.userId,
        grants,
      };
    })
  );
  return {
    kind: "ok",
    bundles,
    members,
    count: roster.count,
    page: roster.page,
    totalPages: Math.max(1, Math.ceil(roster.count / TEAM_PAGE_SIZE)),
  };
}
