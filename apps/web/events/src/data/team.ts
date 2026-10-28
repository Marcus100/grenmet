import "server-only";

import {
  type MembershipRole,
  organisationsListRoleBundles,
  organisationsListTeamMembers,
  organisationsMyTeamCapabilities,
  ResponseError,
  type RoleBundlePublic,
  type TeamMemberGrantPublic,
} from "@barrelsgd/api-client";
import { apiOptions } from "@/lib/api";
import type { OrgContext } from "./org-context";

type Ready = Extract<OrgContext, { ok: true }>;

export const TEAM_PAGE_SIZE = 25;

export interface TeamMember {
  readonly fullName: string;
  /** Live roles for the products the caller manages, from the roster. */
  readonly grants: readonly TeamMemberGrantPublic[];
  readonly membershipId: string;
  readonly role: MembershipRole;
}

/** What the caller may do, from the API (never inferred from a refusal). */
export interface TeamViewer {
  readonly canRemove: boolean;
  readonly isOwner: boolean;
}

export type TeamRead =
  | { readonly kind: "forbidden" }
  | { readonly kind: "not-found" }
  | {
      readonly bundles: readonly RoleBundlePublic[];
      readonly count: number;
      readonly kind: "ok";
      readonly members: readonly TeamMember[];
      readonly page: number;
      readonly totalPages: number;
      readonly viewer: TeamViewer;
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
 * The bundles the caller may see, their capabilities, and the roster with each
 * member's live grants in one call (display names only). A 403 means the
 * caller holds no team-manage permission; a 404 is an unknown organisation.
 * Anything else, including a 401, throws to `error.tsx`.
 */
export async function getTeam(
  context: Ready,
  viewer: { page: number }
): Promise<TeamRead> {
  try {
    const options = request(context);
    const [allBundles, capabilities, roster] = await Promise.all([
      organisationsListRoleBundles(options).unwrap(),
      organisationsMyTeamCapabilities(options).unwrap(),
      organisationsListTeamMembers({
        ...options,
        query: { page: viewer.page, size: TEAM_PAGE_SIZE },
      }).unwrap(),
    ]);
    const bundles = allBundles.filter((bundle) => bundle.product === "events");
    const eventsRoles = new Set(bundles.map((bundle) => bundle.role_key));
    return {
      kind: "ok",
      bundles,
      viewer: {
        canRemove: capabilities.is_admin_or_owner,
        isOwner: capabilities.role === "owner",
      },
      members: roster.data.map(
        (member): TeamMember => ({
          membershipId: member.membership_id,
          fullName: member.name.trim() || "Member",
          role: member.role,
          grants: member.grants.filter((grant) =>
            eventsRoles.has(grant.role_key)
          ),
        })
      ),
      count: roster.count,
      page: roster.page,
      totalPages: Math.max(1, Math.ceil(roster.count / TEAM_PAGE_SIZE)),
    };
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
}
