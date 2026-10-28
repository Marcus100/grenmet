import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { getManagedAccess } from "@/data/events-api";
import { DashShell } from "./dash-shell";
import { OrganiserRequestForm } from "./organiser-request-form";

/**
 * Shown when the console has no workspace for the signed-in member: either
 * they are not part of an organiser yet (offer the request form) or their
 * organiser's Events access is switched off (say so; no form, a request
 * would not help).
 */
export async function NoOrganiserAccess() {
  const access = await getManagedAccess();
  return (
    <DashShell active="events" eventName="Organiser dashboard" isDemo={false}>
      <main className="mx-auto max-w-xl space-y-4 px-4 py-16 text-center">
        {access.kind === "events-disabled" ? (
          <EventsSwitchedOff />
        ) : (
          <>
            <h1 className="font-display font-semibold text-heading-base">
              Become an organiser
            </h1>
            <p className="text-body-base text-muted-foreground">
              Your account isn't linked to an organiser yet. Create one to start
              listing events; the Barrels team reviews and verifies new
              organisers.
            </p>
            <OrganiserRequestForm />
          </>
        )}
        <Link className={cn(buttonVariants({ size: "lg" }), "h-11")} href="/">
          Back to events
        </Link>
      </main>
    </DashShell>
  );
}

function EventsSwitchedOff() {
  return (
    <section aria-labelledby="events-off-title" className="space-y-4">
      <h1
        className="font-display font-semibold text-heading-base"
        id="events-off-title"
      >
        Events is switched off for this organisation
      </h1>
      <p
        className="rounded-2xl border border-border border-dashed bg-card px-4 py-6 text-body-base text-muted-foreground"
        role="status"
      >
        Your organiser exists, but Barrels Events isn't enabled for its
        organisation. Ask Barrels support to switch Events on, then reload this
        page.
      </p>
    </section>
  );
}
