import { Card } from "@barrelsgd/ui/components/ui/card";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DraftEditor } from "@/components/bus/draft-editor";
import {
  BusHeader,
  IssueList,
  VersionStateBadge,
} from "@/components/bus/portal";
import { TimetableView } from "@/components/bus/timetable-view";
import {
  getTimetableVersion,
  getTransportAccess,
  getTransportCatalogue,
} from "@/db/transport/queries";
import { formatDate } from "@/lib/transport/format";
import { groupTrips, issuesByTrip } from "@/lib/transport/timetable";

export const metadata: Metadata = {
  title: "Timetable version",
  description: "A GAA staff bus timetable version and its trips.",
};

export const dynamic = "force-dynamic";

export default async function TimetableVersionPage({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  const versionId = Number((await params).versionId);
  if (!(Number.isSafeInteger(versionId) && versionId > 0)) notFound();

  // Failures propagate to (admin)/error.tsx, which reports them and offers retry.
  const access = await getTransportAccess();
  if (!access.canView) notFound();
  const [detail, catalogue] = await Promise.all([
    getTimetableVersion(versionId),
    getTransportCatalogue(),
  ]);
  if (!detail) notFound();
  const { version } = detail;
  const editable = version.state === "draft" && access.canManageTimetable;

  let summary = `${detail.trips.length} trips`;
  if (version.effectiveDate) {
    summary += ` · effective ${formatDate(version.effectiveDate)}`;
  }
  if (version.sourceRef) summary += ` · source: ${version.sourceRef}`;

  return (
    <div className="space-y-6">
      <BusHeader
        actions={<VersionStateBadge state={version.state} />}
        crumbs={[
          { href: "/bus", label: "Bus" },
          { href: "/bus/timetable", label: "Timetable" },
        ]}
        title={version.label}
      >
        {summary}
      </BusHeader>

      {editable ? (
        <DraftEditor access={access} catalogue={catalogue} detail={detail} />
      ) : (
        <>
          {version.notes ? (
            <p className="text-muted-foreground text-sm">{version.notes}</p>
          ) : null}
          {version.state === "draft" ? (
            <Card className="gap-2 p-4">
              <h2 className="font-semibold">Validation</h2>
              <IssueList issues={detail.issues} />
            </Card>
          ) : null}
          <TimetableView
            calendars={catalogue.calendars}
            groups={groupTrips(detail.trips, catalogue)}
            issues={issuesByTrip(detail.issues)}
          />
        </>
      )}
    </div>
  );
}
