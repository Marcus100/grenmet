import type { RoleBundlePublic } from "@barrelsgd/api-client";
import type { TeamMember, TeamViewer } from "@/data/team";
import { bundleCopy, formatUtc } from "@/lib/team-roles";
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
  member,
  today,
  viewer,
}: {
  bundles: readonly RoleBundlePublic[];
  member: TeamMember;
  today: string;
  viewer: TeamViewer;
}) {
  const implicit = member.role !== "member";
  // Only an owner may remove an owner; admins and owners may remove the rest.
  const canRemove =
    viewer.canRemove && (member.role !== "owner" || viewer.isOwner);
  const grantableKeys = new Set(
    bundles.filter((bundle) => bundle.grantable).map((b) => b.role_key)
  );
  return (
    <li className="border-border bg-card space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-base truncate font-medium">
            {member.fullName}
          </p>
          <p className="text-caption text-muted-foreground truncate">
            {ROLE_WORDS[member.role]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {implicit ? null : (
            <GrantRoleDialog
              bundles={bundles}
              heldRoleKeys={member.grants.map((grant) => grant.role_key)}
              memberName={member.fullName}
              membershipId={member.membershipId}
              today={today}
            />
          )}
          {canRemove ? (
            <RemoveMemberDialog
              memberName={member.fullName}
              membershipId={member.membershipId}
              targetRole={member.role}
            />
          ) : null}
        </div>
      </div>

      {implicit ? (
        <p className="text-body text-muted-foreground">
          {ROLE_WORDS[member.role]}s have every Events role without being given
          one.
        </p>
      ) : null}

      {member.grants.length === 0 ? (
        <p className="text-body text-muted-foreground">
          {implicit
            ? "No extra roles given."
            : "No roles yet. This member can only use the public site until you give a role."}
        </p>
      ) : null}

      {member.grants.length > 0 ? (
        <ul className="space-y-2">
          {member.grants.map((grant) => {
            const copy = bundleCopy(grant.role_key);
            return (
              <li
                className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2"
                key={grant.id}
              >
                <div className="min-w-0">
                  <p className="text-body font-medium">{copy.title}</p>
                  <p className="text-caption text-muted-foreground">
                    {copy.description}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {grant.expires_at
                      ? `Ends ${formatUtc(grant.expires_at)}.`
                      : "No end date."}
                  </p>
                </div>
                {grantableKeys.has(grant.role_key) ? (
                  <RevokeGrantDialog
                    grant={grant}
                    memberName={member.fullName}
                  />
                ) : (
                  <p className="text-caption text-muted-foreground max-w-xs">
                    You can't take this away because you don't hold it yourself.
                  </p>
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
  members,
  today,
  viewer,
}: {
  bundles: readonly RoleBundlePublic[];
  members: readonly TeamMember[];
  today: string;
  viewer: TeamViewer;
}) {
  if (members.length === 0) {
    return (
      <p
        className="bg-card text-body text-muted-foreground rounded-2xl border border-dashed px-4 py-8 text-center"
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
          key={member.membershipId}
          member={member}
          today={today}
          viewer={viewer}
        />
      ))}
    </ul>
  );
}
