import type { Metadata } from "next";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { OrganiserOverview } from "@/components/dash/organiser-overview";
import { OrganiserVerificationNotice } from "@/components/dash/organiser-verification-notice";
import { rememberedEvent } from "@/data/event-choice";
import { getManagedOrganiser, getSettlementSummaries } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";

/** Organiser data is per-user and live; never prerender it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Organiser overview" };

export default async function DashOverviewPage() {
  const viewer = await requireViewer("/dash");
  const managed = await getManagedOrganiser();
  if (!managed) {
    return <NoOrganiserAccess />;
  }

  const settlement = await getSettlementSummaries();
  const event = await rememberedEvent(managed.listings);

  return (
    <>
      {managed.organiser.verified ? null : (
        <OrganiserVerificationNotice name={managed.organiser.name} />
      )}
      <OrganiserOverview
        event={event}
        listings={managed.listings}
        now={new Date()}
        organiser={managed.organiser}
        organisers={managed.organisers}
        settlement={settlement}
        viewerName={viewer.name}
      />
    </>
  );
}
