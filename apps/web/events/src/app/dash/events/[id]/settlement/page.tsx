import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashShell } from "@/components/dash/dash-shell";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { SettlementReport } from "@/components/dash/settlement-report";
import { getManagedOrganiser, getSettlement } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";
import { formatEventDate } from "@/lib/datetime";

/** Settlement is live and per-organiser; never prerender it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settlement" };

export default async function SettlementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireViewer(`/dash/events/${id}/settlement`);
  const managed = await getManagedOrganiser();
  if (!managed) {
    return <NoOrganiserAccess />;
  }
  const report = await getSettlement(id);
  if (!report) {
    notFound();
  }

  return (
    <DashShell
      active="events"
      currentOrganiser={managed.organiser.slug}
      eventName={report.title}
      isDemo={false}
      organisers={managed.organisers}
    >
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link
              className="text-caption text-muted-foreground hover:underline"
              href={`/dash/events/${id}`}
            >
              ← {report.title}
            </Link>
            <h1 className="font-display text-heading-base mt-1 font-semibold">
              Settlement
            </h1>
            <p className="text-body text-muted-foreground">
              {formatEventDate(report.startsAt)}
            </p>
          </div>
          <a
            className={cn(buttonVariants({ variant: "outline" }))}
            download
            href={`/dash/events/${id}/settlement/csv`}
          >
            <Download data-icon="inline-start" />
            Export CSV
          </a>
        </div>
        <SettlementReport report={report} />
      </main>
    </DashShell>
  );
}
