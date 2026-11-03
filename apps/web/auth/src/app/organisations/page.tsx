import type { Metadata } from "next";
import Link from "next/link";
import {
  AccountLayout,
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { textLinkClass } from "@/components/form-styles";
import { requireAccount } from "@/lib/account";
import { listMyOrganisations } from "@/lib/account-organisations";
import { canManageRewards } from "@/lib/org-rewards";
import { readQueryParam } from "@/lib/return-to";

export const metadata: Metadata = { title: "Organisations — Barrels account" };
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  joined: "You joined the organisation.",
};

const ROLE_LABELS = {
  admin: "Admin",
  member: "Member",
  owner: "Owner",
} as const;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OrganisationsPage({ searchParams }: PageProps) {
  const session = await requireAccount();
  const memberships = await listMyOrganisations(session.access_token);
  // Only owners and admins of an active organisation with Rewards get the link.
  const rewardsLinks = new Set(
    (
      await Promise.all(
        memberships.map(async (membership) => {
          const manages =
            membership.role !== "member" &&
            membership.organisation.status === "active";
          return manages &&
            (await canManageRewards(
              session.access_token,
              membership.organisation.id
            ))
            ? membership.organisation.id
            : null;
        })
      )
    ).filter((id): id is string => id !== null)
  );
  const notice = NOTICES[readQueryParam((await searchParams).notice) ?? ""];

  return (
    <AccountLayout
      current="/organisations"
      description="The organisations you act for. An owner or admin invites people by email; the invitation link brings you back here."
      title="Organisations"
    >
      {notice ? (
        <p className="text-muted-foreground text-sm" role="status">
          {notice}
        </p>
      ) : null}
      <SettingsSection title="Your organisations">
        {memberships.length === 0 ? (
          <p className="text-muted-foreground py-5 text-sm">
            You are not part of an organisation yet. Ask an owner or admin to
            invite you, then open the link in your email.
          </p>
        ) : null}
        {memberships.map((membership) => (
          <SettingsRow
            action={
              rewardsLinks.has(membership.organisation.id) ? (
                <Link
                  className={textLinkClass}
                  href={`/organisations/${membership.organisation.id}/rewards`}
                >
                  Manage rewards
                  <span className="sr-only">
                    {" "}
                    for {membership.organisation.name}
                  </span>
                </Link>
              ) : null
            }
            description={
              membership.organisation.status === "suspended"
                ? "This organisation is suspended."
                : `Joined ${new Date(membership.joined_at).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" })}`
            }
            key={membership.membership_id}
            title={membership.organisation.name}
          >
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="neutral">
                {ROLE_LABELS[membership.role]}
              </StatusBadge>
              {membership.organisation.verified_at ? (
                <StatusBadge tone="on">Verified</StatusBadge>
              ) : null}
            </div>
          </SettingsRow>
        ))}
      </SettingsSection>
    </AccountLayout>
  );
}
