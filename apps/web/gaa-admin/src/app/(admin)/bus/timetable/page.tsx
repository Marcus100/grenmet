import type { TimetableVersionSummary } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { FilePen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BusHeader, VersionStateBadge } from "@/components/bus/portal";
import { RoutesManager } from "@/components/bus/routes-manager";
import { StartDraftButton } from "@/components/bus/start-draft-button";
import { TimetableView } from "@/components/bus/timetable-view";
import {
  getCurrentTimetable,
  getTimetableVersions,
  getTransportAccess,
  getTransportCatalogue,
} from "@/db/transport/queries";
import { formatDate } from "@/lib/transport/format";
import { groupTrips, issuesByTrip } from "@/lib/transport/timetable";

export const metadata: Metadata = {
  title: "Bus timetable",
  description:
    "The GAA staff bus timetable in force, its versions, and the route registry.",
};

export const dynamic = "force-dynamic";

export default async function BusTimetablePage() {
  // Failures propagate to (admin)/error.tsx, which reports them and offers retry.
  const [access, current] = await Promise.all([
    getTransportAccess(),
    getCurrentTimetable(),
  ]);
  const [versions, catalogue] = await Promise.all([
    access.canView ? getTimetableVersions() : null,
    getTransportCatalogue(),
  ]);
  const draft = versions?.find((version) => version.state === "draft");

  return (
    <div className="space-y-8">
      <BusHeader
        actions={
          access.canManageTimetable ? <DraftAction draftId={draft?.id} /> : null
        }
        crumbs={access.canView ? [{ href: "/bus", label: "Bus" }] : []}
        title="Timetable"
      >
        {current
          ? `${current.version.label} · in force since ${formatDate(current.version.effectiveDate ?? "")} · ${current.trips.length} trips`
          : "No timetable is in force yet."}
      </BusHeader>

      {versions ? <VersionsTable versions={versions} /> : null}

      {current ? (
        <TimetableView
          calendars={catalogue.calendars}
          groups={groupTrips(current.trips, catalogue)}
          issues={access.canView ? issuesByTrip(current.issues) : undefined}
        />
      ) : null}
      {current ? null : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing published yet</EmptyTitle>
            <EmptyDescription>
              Start a draft, add trips, then publish it with an effective date.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {access.canView ? (
        <RoutesManager
          canManage={access.canManageTimetable}
          routes={catalogue.routes}
        />
      ) : null}
    </div>
  );
}

function DraftAction({ draftId }: { draftId?: number }) {
  if (draftId === undefined) return <StartDraftButton />;
  return (
    <Button render={<Link href={`/bus/timetable/${draftId}`} />}>
      <FilePen /> Continue draft
    </Button>
  );
}

function VersionsTable({ versions }: { versions: TimetableVersionSummary[] }) {
  return (
    <section aria-labelledby="versions-heading" className="space-y-3">
      <h2 className="font-semibold text-lg" id="versions-heading">
        Versions
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-28">State</TableHead>
            <TableHead className="w-32">Effective</TableHead>
            <TableHead className="w-20 text-right">Trips</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((version) => (
            <TableRow key={version.id}>
              <TableCell>
                <Link
                  className="underline-offset-4 hover:underline"
                  href={`/bus/timetable/${version.id}`}
                >
                  {version.label}
                </Link>
              </TableCell>
              <TableCell>
                <VersionStateBadge state={version.state} />
              </TableCell>
              <TableCell className="tabular-nums">
                {version.effectiveDate
                  ? formatDate(version.effectiveDate)
                  : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {version.tripCount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
