import type {
  MembershipGrantPublic,
  RoleBundlePublic,
} from "@barrelsgd/api-client";
import type { TeamMember } from "@/data/team";

export function makeBundle(
  overrides: Partial<RoleBundlePublic> = {}
): RoleBundlePublic {
  return {
    role_key: "events-door",
    label: "Door staff",
    description: "Scan tickets at the door",
    product: "events",
    permissions: ["events.door.scan"],
    grantable: true,
    ...overrides,
  };
}

export function makeGrant(
  overrides: Partial<MembershipGrantPublic> = {}
): MembershipGrantPublic {
  return {
    id: "grant_1",
    membership_id: "mem_1",
    member_name: "Ana Door",
    role_key: "events-door",
    granted_by_name: "Olu Owner",
    granted_at: "2026-10-20T10:00:00Z",
    expires_at: null,
    revoked_at: null,
    ...overrides,
  };
}

export function makeTeamMember(
  overrides: Partial<TeamMember> = {}
): TeamMember {
  return {
    membershipId: "mem_1",
    fullName: "Ana Door",
    isSelf: false,
    role: "member",
    grants: [],
    ...overrides,
  };
}
