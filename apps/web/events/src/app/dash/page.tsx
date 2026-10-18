import type { Metadata } from "next";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { OrganiserOverview } from "@/components/dash/organiser-overview";
import { getManagedOrganiser, getSettlementSummaries } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";

/** Organiser data is per-user and live; never prerender it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Organiser overview" };

export default async function DashOverviewPage() {
  await requireViewer("/dash");
  const managed = await getManagedOrganiser();
  if (!managed) {
    return <NoOrganiserAccess />;
  }

  const settlement = await getSettlementSummaries();

  return (
    <>
      {managed.organiser.verified ? null : (
        <p
          className="bg-muted px-4 py-2 text-center text-body text-muted-foreground"
          role="status"
        >
          {managed.organiser.name} is awaiting verification by the Barrels team.
        </p>
      )}
      <OrganiserOverview
        listings={managed.listings}
        now={new Date()}
        organiser={managed.organiser}
        organisers={managed.organisers}
        settlement={settlement}
      />
    </>
  );
}
