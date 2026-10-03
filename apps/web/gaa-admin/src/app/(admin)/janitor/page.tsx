import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { Building2, ListChecks, MapPin, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel, PanelEmpty } from "@/app/(admin)/_components/panel";
import {
  AwaitingFieldData,
  JanitorHeader,
  Kpi,
  SiteSwitcher,
} from "@/components/janitorial/portal";
import {
  getJanitorialAccess,
  getJanitorialCatalogue,
} from "@/db/janitorial/queries";
import {
  flattenAreas,
  highFrequencyAreas,
  siteParam,
  summarise,
  workloadByBuilding,
} from "@/lib/janitorial/catalogue";
import { formatFrequency, formatPerDay } from "@/lib/janitorial/format";

export const metadata: Metadata = {
  title: "Janitorial",
  description:
    "Monitor GAA airport cleaning — workload, high-frequency areas, and contractor service.",
};

export const dynamic = "force-dynamic";

const HIGH_FREQUENCY_LIMIT = 8;

export default async function JanitorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const site = siteParam((await searchParams).site);
  // Failures propagate to (admin)/error.tsx, which reports them and offers retry.
  const access = await getJanitorialAccess();
  if (!access.canView) notFound();
  const catalogue = await getJanitorialCatalogue(site);
  const { buildings } = catalogue;
  const rows = flattenAreas(buildings);
  const summary = summarise(buildings, rows);
  const workload = workloadByBuilding(buildings, rows);
  const watchList = highFrequencyAreas(rows, HIGH_FREQUENCY_LIMIT);
  const siteName =
    catalogue.sites.find((value) => value.code === site)?.name ?? site;

  return (
    <div className="space-y-6">
      <JanitorHeader
        actions={
          <SiteSwitcher
            current={site}
            href={(code) => `/janitor?site=${code}`}
          />
        }
        title="Janitorial overview"
      >
        {siteName} — cleaning programme from the published specification.
      </JanitorHeader>

      <section
        aria-label="Programme figures"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Kpi
          icon={Building2}
          label="Buildings"
          value={String(summary.buildings)}
        />
        <Kpi
          hint={`${summary.tasks} scheduled tasks`}
          icon={MapPin}
          label="Areas"
          value={String(summary.areas)}
        />
        <Kpi
          hint="Scheduled task occurrences"
          icon={ListChecks}
          label="Tasks per day"
          value={formatPerDay(summary.perDay)}
        />
        <Kpi
          hint="Serviced hourly or more"
          icon={Timer}
          label="High-frequency areas"
          value={String(summary.highFrequencyAreas)}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          action={{ href: `/janitor/areas?site=${site}`, label: "All areas" }}
          className="xl:col-span-2"
          description="Scheduled cleaning load per building."
          title="Workload by building"
        >
          {workload.length === 0 ? (
            <PanelEmpty>
              No buildings here yet
              {access.canManageCatalogue ? (
                <>
                  {" — "}
                  <Link
                    className="text-primary hover:underline"
                    href={`/janitor/setup?site=${site}`}
                  >
                    add them in Setup
                  </Link>
                </>
              ) : null}
              .
            </PanelEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Building</TableHead>
                  <TableHead className="text-right">Areas</TableHead>
                  <TableHead className="text-right">High-frequency</TableHead>
                  <TableHead className="text-right">Tasks/day</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workload.map((building) => (
                  <TableRow key={building.id}>
                    <TableCell>
                      <Link
                        className="font-medium hover:underline"
                        href={`/janitor/areas?site=${site}&building=${building.id}`}
                      >
                        {building.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {building.areas}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {building.highFrequencyAreas}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatPerDay(building.perDay)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>

        <Panel
          action={{
            href: `/janitor/areas?site=${site}&cadence=high`,
            label: "View all",
          }}
          description="Areas the live board will watch most closely."
          title="High-frequency areas"
        >
          {watchList.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No areas are serviced hourly or more.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {watchList.map((row) => (
                <li
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                  key={row.id}
                >
                  <Link
                    className="min-w-0 hover:underline"
                    href={`/janitor/areas/${row.id}`}
                  >
                    <span className="block truncate font-medium">
                      {row.name}
                    </span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {row.buildingName}
                    </span>
                  </Link>
                  {row.fastest ? (
                    <span className="shrink-0 font-mono text-muted-foreground text-xs">
                      {formatFrequency(row.fastest)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <section
        aria-label="Field monitoring"
        className="grid gap-4 md:grid-cols-3"
      >
        <Panel description="Clean, due and overdue areas." title="Live status">
          <AwaitingFieldData
            description="Starts when cleaners check in to areas from the janitor app."
            title="No check-ins yet"
          />
        </Panel>
        <Panel
          description="Spills, damage and supplies reported on site."
          title="Open issues"
        >
          <AwaitingFieldData
            description="Issues raised in the janitor app will queue here."
            title="No issues yet"
          />
        </Panel>
        <Panel
          description="Supervisor scores against the cleaning standard."
          title="Inspections"
        >
          <AwaitingFieldData
            description="Inspection scores and service levels will appear here."
            title="No inspections yet"
          />
        </Panel>
      </section>
    </div>
  );
}
