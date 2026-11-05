import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashShell } from "@/components/dash/dash-shell";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { OutletConsole } from "@/components/dash/outlet-console";
import { getManagedOrganiser, getOutlet } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";
import { formatEventDate } from "@/lib/datetime";

/** Outlet data is live and per-staff; never prerender it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Outlet sales" };

export default async function OutletPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireViewer(`/dash/events/${id}/outlet`);
  const managed = await getManagedOrganiser();
  if (!managed) {
    return <NoOrganiserAccess />;
  }
  const outlet = await getOutlet(id);
  if (!outlet) {
    notFound();
  }

  return (
    <DashShell
      active="events"
      currentOrganiser={managed.organiser.slug}
      eventName={outlet.title}
      isDemo={false}
      organisers={managed.organisers}
    >
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <Link
            className="text-caption text-muted-foreground hover:underline"
            href={`/dash/events/${id}`}
          >
            ← {outlet.title}
          </Link>
          <h1 className="font-display text-heading-base mt-1 font-semibold">
            Outlet sales
          </h1>
          <p className="text-body text-muted-foreground">
            {formatEventDate(outlet.startsAt)} · cash sales by your own staff
          </p>
        </div>
        <OutletConsole outlet={outlet} />
      </main>
    </DashShell>
  );
}
