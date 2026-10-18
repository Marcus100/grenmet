import type { Metadata } from "next";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { OrganiserOverview } from "@/components/dash/organiser-overview";
import { getManagedOrganiser } from "@/data/events-api";
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

  return (
    <OrganiserOverview
      listings={managed.listings}
      now={new Date()}
      organiser={managed.organiser}
      organisers={managed.organisers}
    />
  );
}
