import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashShell } from "@/components/dash/dash-shell";
import { DoorConsole } from "@/components/dash/door-console";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { getDoorManifest, getManagedOrganiser } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";
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
  await requireViewer(`/dash/events/${id}/door`);
  const managed = await getManagedOrganiser();
  if (!managed) {
    return <NoOrganiserAccess />;
  }
  const manifest = await getDoorManifest(id);
  if (!manifest) {
    notFound();
  }

  return (
    <DashShell
      active="events"
      currentOrganiser={managed.organiser.slug}
      eventName={manifest.title}
      isDemo={false}
      organisers={managed.organisers}
    >
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="print:hidden">
          <Link
            className="text-caption text-muted-foreground hover:underline"
            href={`/dash/events/${id}`}
          >
            ← {manifest.title}
          </Link>
          <h1 className="mt-1 font-display font-semibold text-heading-base">
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
