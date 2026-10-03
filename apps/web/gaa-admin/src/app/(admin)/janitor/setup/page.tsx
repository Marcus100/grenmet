import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JanitorHeader, SiteSwitcher } from "@/components/janitorial/portal";
import { SetupManager } from "@/components/janitorial/setup-manager";
import {
  getJanitorialAccess,
  getJanitorialCatalogue,
} from "@/db/janitorial/queries";
import { siteParam } from "@/lib/janitorial/catalogue";

export const metadata: Metadata = {
  title: "Janitorial setup",
  description:
    "Buildings, sections and areas in the GAA cleaning specification.",
};

export const dynamic = "force-dynamic";

export default async function JanitorSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const site = siteParam((await searchParams).site);
  // Failures propagate to (admin)/error.tsx, which reports them and offers retry.
  const access = await getJanitorialAccess();
  if (!(access.canView && access.canManageCatalogue)) notFound();
  const catalogue = await getJanitorialCatalogue(site);
  const current = catalogue.sites.find((value) => value.code === site);
  if (!current) notFound();

  return (
    <div className="space-y-6">
      <JanitorHeader
        actions={
          <SiteSwitcher
            current={site}
            href={(code) => `/janitor/setup?site=${code}`}
          />
        }
        crumbs={[{ href: `/janitor?site=${site}`, label: "Janitorial" }]}
        title="Setup"
      >
        The cleaning specification for {current.name}: buildings, their sections
        and areas.
      </JanitorHeader>
      <SetupManager
        buildings={catalogue.buildings}
        // A new building has no grants yet, so only all-building admins add one.
        canAddBuildings={access.buildingIds === null}
        siteCode={site}
        siteId={current.id}
        siteName={current.name}
      />
    </div>
  );
}
