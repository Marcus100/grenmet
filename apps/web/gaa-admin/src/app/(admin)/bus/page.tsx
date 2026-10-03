import { Button } from "@barrelsgd/ui/components/ui/button";
import { Card } from "@barrelsgd/ui/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import {
  CalendarClock,
  Lock,
  MapPin,
  Route,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BusHeader, VersionStateBadge } from "@/components/bus/portal";
import { Kpi } from "@/components/janitorial/portal";
import {
  getCurrentTimetable,
  getTimetableVersions,
  getTransportAccess,
  getTransportCatalogue,
} from "@/db/transport/queries";
import { formatDate } from "@/lib/transport/format";
import { awaitingConfirmation } from "@/lib/transport/timetable";

export const metadata: Metadata = {
  title: "Bus",
  description:
    "Staff bus administration — timetable versions, stops and routes for the GAA staff transport service.",
};

export const dynamic = "force-dynamic";

export default async function BusPage() {
  // Failures propagate to (admin)/error.tsx, which reports them and offers retry.
  const access = await getTransportAccess();
  if (!access.canView) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Lock />
          </EmptyMedia>
          <EmptyTitle>Bus portal access needed</EmptyTitle>
          <EmptyDescription>
            Ask a Transport officer for a transport role. The timetable in force
            is still available to all staff.
          </EmptyDescription>
        </EmptyHeader>
        <Button render={<Link href="/bus/timetable" />} variant="outline">
          View the timetable
        </Button>
      </Empty>
    );
  }

  const [current, versions, catalogue] = await Promise.all([
    getCurrentTimetable(),
    getTimetableVersions(),
    getTransportCatalogue(),
  ]);
  const draft = versions.find((version) => version.state === "draft");
  const scheduled = versions
    .filter((version) => version.state === "scheduled")
    .sort((a, b) =>
      (a.effectiveDate ?? "").localeCompare(b.effectiveDate ?? "")
    );
  const activeStops = catalogue.stops.filter((stop) => stop.active);
  const mapped = activeStops.filter((stop) => stop.latitude != null).length;
  const trips = current?.trips ?? [];
  const pending = awaitingConfirmation(trips);

  return (
    <div className="space-y-6">
      <BusHeader
        actions={
          <>
            <Button render={<Link href="/bus/timetable" />}>Timetable</Button>
            <Button render={<Link href="/bus/stops" />} variant="outline">
              Stops
            </Button>
          </>
        }
        title="Staff bus"
      >
        Administration for the GAA staff transport service. Drivers and staff
        use their own apps; this portal sets what they see.
      </BusHeader>

      <section
        aria-label="Service figures"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Kpi
          hint={`${catalogue.routes.length} in the registry`}
          icon={Route}
          label="Active routes"
          value={String(catalogue.routes.filter((r) => r.active).length)}
        />
        <Kpi
          hint="In the timetable in force"
          icon={CalendarClock}
          label="Scheduled trips"
          value={String(trips.length)}
        />
        <Kpi
          hint={`${activeStops.length - mapped} still need a location`}
          icon={MapPin}
          label="Stops on the map"
          value={`${mapped}/${activeStops.length}`}
        />
        <Kpi
          hint="Trips with unconfirmed times"
          icon={TriangleAlert}
          label="Awaiting confirmation"
          value={String(pending)}
        />
      </section>

      <Card className="gap-3 p-4">
        <h2 className="font-semibold">Timetable</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">In force</dt>
            <dd>
              {current ? (
                <Link
                  className="underline-offset-4 hover:underline"
                  href={`/bus/timetable/${current.version.id}`}
                >
                  {current.version.label}
                </Link>
              ) : (
                "None published"
              )}
              {current?.version.effectiveDate
                ? ` · since ${formatDate(current.version.effectiveDate)}`
                : null}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Next change</dt>
            <dd>
              {scheduled[0] ? (
                <Link
                  className="underline-offset-4 hover:underline"
                  href={`/bus/timetable/${scheduled[0].id}`}
                >
                  {scheduled[0].label}
                </Link>
              ) : (
                "None scheduled"
              )}
              {scheduled[0]?.effectiveDate
                ? ` · from ${formatDate(scheduled[0].effectiveDate)}`
                : null}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Draft</dt>
            <dd className="flex items-center gap-2">
              {draft ? (
                <>
                  <Link
                    className="underline-offset-4 hover:underline"
                    href={`/bus/timetable/${draft.id}`}
                  >
                    {draft.label}
                  </Link>
                  <VersionStateBadge state="draft" />
                </>
              ) : (
                "No draft in progress"
              )}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
