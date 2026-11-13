import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccountLayout } from "@/components/account-layout";
import { textLinkClass } from "@/components/form-styles";
import { AchievementsSection } from "@/components/org-rewards/achievements-section";
import { ChallengesSection } from "@/components/org-rewards/challenges-section";
import { ProgrammesSection } from "@/components/org-rewards/programmes-section";
import { RedemptionsSection } from "@/components/org-rewards/redemptions-section";
import { SectionSkeleton } from "@/components/org-rewards/section-frame";
import { TrailsSection } from "@/components/org-rewards/trails-section";
import { VenuesSection } from "@/components/org-rewards/venues-section";
import { requireAccount } from "@/lib/account";
import { listMyOrganisations } from "@/lib/account-organisations";
import { listProgrammes } from "@/lib/org-rewards";
import { classifyFailure } from "@/lib/org-rewards-errors";
import { ORGANISATION_ID } from "@/lib/org-rewards-options";

export const metadata: Metadata = {
  title: "Organisation rewards — Barrels account",
};
export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "stamp-cards", label: "Stamp cards" },
  { id: "redemptions", label: "Redemptions and activity" },
  { id: "venues", label: "Venues and QR" },
  { id: "trails", label: "Trails and stops" },
  { id: "achievements", label: "Achievements" },
  { id: "challenges", label: "Challenges" },
] as const;

type Gate = "ok" | "not-entitled" | "forbidden";

/** One cheap read answers "does this organisation have rewards, and may I?". */
async function gate(token: string, organisationId: string): Promise<Gate> {
  try {
    await listProgrammes(token, organisationId);
    return "ok";
  } catch (error) {
    const kind = classifyFailure(error);
    if (kind === "not-entitled") return "not-entitled";
    if (kind === "forbidden") return "forbidden";
    // Anything else is reported by the section that fails the same way.
    return "ok";
  }
}

function Explainer({
  children,
  title,
}: {
  readonly children: string;
  readonly title: string;
}) {
  return (
    <section aria-label={title} className="space-y-2 py-2">
      <h2 className="text-foreground text-base font-medium">{title}</h2>
      <p className="text-muted-foreground text-sm">{children}</p>
    </section>
  );
}

interface PageProps {
  params: Promise<{ organisationId: string }>;
}

export default async function OrganisationRewardsPage({ params }: PageProps) {
  const { organisationId } = await params;
  if (!ORGANISATION_ID.test(organisationId)) notFound();
  const session = await requireAccount();
  const token = session.access_token;
  const memberships = await listMyOrganisations(token);
  const membership = memberships.find(
    (item) => item.organisation.id === organisationId
  );
  if (!membership) notFound();

  const canManage = membership.role === "admin" || membership.role === "owner";
  const access: Gate = canManage ? await gate(token, organisationId) : "ok";

  return (
    <AccountLayout
      current="/organisations"
      description={`Rewards for ${membership.organisation.name}. Stamps, trails and achievements come from real-world check-ins, purchases and visits. Nothing here ranks people by how much they spend.`}
      title="Organisation rewards"
    >
      <p>
        <Link className={textLinkClass} href="/organisations">
          Back to organisations
        </Link>
      </p>
      {canManage ? null : (
        <Explainer title="Owners and admins only">
          Only an owner or admin of this organisation can manage its rewards.
          Ask one of them to add you as an admin.
        </Explainer>
      )}
      {access === "not-entitled" ? (
        <Explainer title="Rewards isn't switched on for this organisation">
          Rewards is a separate Barrels product. Ask the Barrels team to enable
          it for this organisation, then come back.
        </Explainer>
      ) : null}
      {access === "forbidden" ? (
        <Explainer title="You can't manage rewards right now">
          Your role or this organisation's status doesn't allow it. A suspended
          organisation can't change rewards.
        </Explainer>
      ) : null}
      {canManage && access === "ok" ? (
        <>
          <nav aria-label="Rewards sections">
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a className={textLinkClass} href={`#${section.id}`}>
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="scroll-mt-6" id="stamp-cards">
            <Suspense fallback={<SectionSkeleton title="stamp cards" />}>
              <ProgrammesSection
                organisationId={organisationId}
                token={token}
              />
            </Suspense>
          </div>
          <div className="scroll-mt-6" id="redemptions">
            <RedemptionsSection organisationId={organisationId} token={token} />
          </div>
          <div className="scroll-mt-6" id="venues">
            <Suspense fallback={<SectionSkeleton title="venues" />}>
              <VenuesSection organisationId={organisationId} token={token} />
            </Suspense>
          </div>
          <div className="scroll-mt-6" id="trails">
            <Suspense fallback={<SectionSkeleton title="trails" />}>
              <TrailsSection organisationId={organisationId} token={token} />
            </Suspense>
          </div>
          <div className="scroll-mt-6" id="achievements">
            <Suspense fallback={<SectionSkeleton title="achievements" />}>
              <AchievementsSection
                organisationId={organisationId}
                token={token}
              />
            </Suspense>
          </div>
          <div className="scroll-mt-6" id="challenges">
            <Suspense fallback={<SectionSkeleton title="challenges" />}>
              <ChallengesSection
                organisationId={organisationId}
                token={token}
              />
            </Suspense>
          </div>
        </>
      ) : null}
    </AccountLayout>
  );
}
