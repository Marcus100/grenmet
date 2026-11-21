import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashShell } from "@/components/dash/dash-shell";
import { DoorConsole } from "@/components/dash/door-console";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { getDoorManifest, getManagedOrganiser } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";
import { shellEventOf } from "@/lib/dash-navigation";
import { formatEventDate } from "@/lib/datetime";

/** Door data is live and per-organiser; never prerender it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Door" };

export default async function DoorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await requireViewer(`/dash/events/${id}/door`);
  const managed = await getManagedOrganiser();
  if (!managed) {
    return <NoOrganiserAccess />;
  }
  const manifest = await getDoorManifest(id);
  if (!manifest) {
    notFound();
  }
  const listing = managed.listings.find((candidate) => candidate.id === id);

  return (
    <DashShell
      active="door"
      currentOrganiser={managed.organiser.slug}
      event={listing ? shellEventOf(listing) : null}
      eventName={manifest.title}
      organisers={managed.organisers}
      viewerName={viewer.name}
    >
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="print:hidden">
          <Link
            className="text-caption text-muted-foreground hover:underline"
            href={`/dash/events/${id}`}
          >
            ← {manifest.title}
          </Link>
          <h1 className="font-display text-heading-base mt-1 font-semibold">
            Door
          </h1>
          <p className="text-body text-muted-foreground">
            {formatEventDate(manifest.startsAt)}
          </p>
        </div>
        <DoorConsole listingId={id} manifest={manifest} />
      </main>
    </DashShell>
  );
}
