import type { RoleBundlePublic } from "@barrelsgd/api-client";
import type { TeamMember } from "@/data/team";
import {
  bundleCopy,
  formatUtc,
  MEMBER_ROLES_UNAVAILABLE,
} from "@/lib/team-roles";
import { GrantRoleDialog } from "./grant-role-dialog";
import { RemoveMemberDialog } from "./remove-member-dialog";
import { RevokeGrantDialog } from "./revoke-grant-dialog";

const ROLE_WORDS: Record<TeamMember["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

function MemberRow({
  bundles,
  canRemove,
  member,
  today,
}: {
  bundles: readonly RoleBundlePublic[];
  canRemove: boolean;
  member: TeamMember;
  today: string;
}) {
  const implicit = member.role !== "member";
  return (
    <li className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-body-base">
            {member.fullName}
            {member.isSelf ? (
              <span className="font-normal text-muted-foreground"> (you)</span>
            ) : null}
          </p>
          <p className="truncate text-caption text-muted-foreground">
            {ROLE_WORDS[member.role]}
          </p>
        </div>
        {member.isSelf ? (
          <p className="max-w-xs text-caption text-muted-foreground">
            You can't change your own roles.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {member.grants !== null && !implicit ? (
              <GrantRoleDialog
                bundles={bundles}
                heldRoleKeys={member.grants.map((grant) => grant.role_key)}
                memberName={member.fullName}
                membershipId={member.membershipId}
                today={today}
              />
            ) : null}
            {canRemove ? (
              <RemoveMemberDialog
                memberName={member.fullName}
                membershipId={member.membershipId}
                targetRole={member.role}
              />
            ) : null}
          </div>
        )}
      </div>

      {implicit ? (
        <p className="text-body text-muted-foreground">
          {ROLE_WORDS[member.role]}s have every Events role without being given
          one.
        </p>
      ) : null}

      {member.grants === null ? (
        <p className="text-body text-destructive">{MEMBER_ROLES_UNAVAILABLE}</p>
      ) : null}

      {member.grants?.length === 0 ? (
        <p className="text-body text-muted-foreground">
          {implicit
            ? "No extra roles given."
            : "No roles yet. This member can only use the public site until you give a role."}
        </p>
      ) : null}

      {member.grants && member.grants.length > 0 ? (
        <ul className="space-y-2">
          {member.grants.map((grant) => {
            const copy = bundleCopy(grant.role_key);
            return (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3 py-2"
                key={grant.id}
              >
                <div className="min-w-0">
                  <p className="font-medium text-body">{copy.title}</p>
                  <p className="text-caption text-muted-foreground">
                    {copy.description}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {grant.granted_by_name
                      ? `Given by ${grant.granted_by_name}. `
                      : ""}
                    {grant.expires_at
                      ? `Ends ${formatUtc(grant.expires_at)}.`
                      : "No end date."}
                  </p>
                </div>
                {member.isSelf ? null : (
                  <RevokeGrantDialog
                    grant={grant}
                    memberName={member.fullName}
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Members with their live roles. Presentational and product-agnostic: the
 * bundle words come from `lib/team-roles`, the data from the page, so Bookings
 * can reuse it. Always renders something: an empty roster says so.
 */
export function TeamMembers({
  bundles,
  canRemove,
  members,
  today,
}: {
  bundles: readonly RoleBundlePublic[];
  canRemove: boolean;
  members: readonly TeamMember[] | null;
  today: string;
}) {
  if (members === null) {
    return (
      <p
        className="rounded-2xl border border-dashed bg-card px-4 py-8 text-center text-body text-muted-foreground"
        role="status"
      >
        You can manage roles, but the member list is only available to owners
        and admins, so there is nobody to show here. Ask an owner or admin to
        give or take away roles.
      </p>
    );
  }
  if (members.length === 0) {
    return (
      <p
        className="rounded-2xl border border-dashed bg-card px-4 py-8 text-center text-body text-muted-foreground"
        role="status"
      >
        This organisation has no members yet.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {members.map((member) => (
        <MemberRow
          bundles={bundles}
          canRemove={canRemove}
          key={member.membershipId}
          member={member}
          today={today}
        />
      ))}
    </ul>
  );
}
