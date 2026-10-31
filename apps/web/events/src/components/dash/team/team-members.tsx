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

function noRolesText(implicit: boolean, self: boolean): string {
  if (implicit) {
    return "No extra roles given.";
  }
  if (self) {
    return "You have no Events roles yet.";
  }
  return "No roles yet. This member can only use the public site until you give a role.";
}

/** Take away, or why the caller can't: only roles they hold themselves. */
function GrantControl({
  canTakeAway,
  grant,
  memberName,
  roleTitle,
}: {
  canTakeAway: boolean;
  grant: TeamMember["grants"][number];
  memberName: string;
  roleTitle: string;
}) {
  if (!canTakeAway) {
    return (
      <p className="max-w-xs text-caption text-muted-foreground">
        You can't take this away because you don't hold it yourself.
      </p>
    );
  }
  return (
    <RevokeGrantDialog
      grant={grant}
      memberName={memberName}
      roleTitle={roleTitle}
    />
  );
}

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
  // The API refuses giving or taking away the viewer's own roles; removing
  // yourself is not offered here either (leaving is not a team-manager action).
  const self = member.isSelf;
  // Only an owner may remove an owner; admins and owners may remove the rest.
  const canRemove =
    !self && viewer.canRemove && (member.role !== "owner" || viewer.isOwner);
  const grantableKeys = new Set(
    bundles.filter((bundle) => bundle.grantable).map((b) => b.role_key)
  );
  const bundleByKey = new Map(bundles.map((b) => [b.role_key, b]));
  return (
    <li className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-body-base">
            {member.fullName}
            {self ? (
              <span className="font-normal text-muted-foreground"> (you)</span>
            ) : null}
          </p>
          <p className="truncate text-caption text-muted-foreground">
            {ROLE_WORDS[member.role]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {implicit || self ? null : (
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

      {self ? (
        <p className="text-body text-muted-foreground">
          You can't change your own roles. Ask another team manager.
        </p>
      ) : null}

      {implicit ? (
        <p className="text-body text-muted-foreground">
          {ROLE_WORDS[member.role]}s have every Events role without being given
          one.
        </p>
      ) : null}

      {member.grants.length === 0 ? (
        <p className="text-body text-muted-foreground">
          {noRolesText(implicit, self)}
        </p>
      ) : null}

      {member.grants.length > 0 ? (
        <ul className="space-y-2">
          {member.grants.map((grant) => {
            const bundle = bundleByKey.get(grant.role_key);
            const copy = bundle
              ? { title: bundle.label, description: bundle.description }
              : bundleCopy(grant.role_key);
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
                    {grant.expires_at
                      ? `Ends ${formatUtc(grant.expires_at)}.`
                      : "No end date."}
                  </p>
                  {grant.granted_by_name ? (
                    <p className="text-caption text-muted-foreground">
                      Given by {grant.granted_by_name}.
                    </p>
                  ) : null}
                </div>
                {self ? null : (
                  <GrantControl
                    canTakeAway={grantableKeys.has(grant.role_key)}
                    grant={grant}
                    memberName={member.fullName}
                    roleTitle={copy.title}
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
          key={member.membershipId}
          member={member}
          today={today}
          viewer={viewer}
        />
      ))}
    </ul>
  );
}
