import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { DashShell } from "./dash-shell";

/** Shown to members who are signed in but not part of an organiser. */
export function NoOrganiserAccess() {
  return (
    <DashShell active="events" eventName="Organiser dashboard" isDemo={false}>
      <main className="mx-auto max-w-xl space-y-4 px-4 py-16 text-center">
        <h1 className="font-display font-semibold text-heading-base">
          Organiser access needed
        </h1>
        <p className="text-body-base text-muted-foreground">
          Your account isn't linked to an organiser yet. Ask the Barrels team to
          add you, then come back here to list and manage events.
        </p>
        <Link className={cn(buttonVariants({ size: "lg" }))} href="/">
          Back to events
        </Link>
      </main>
    </DashShell>
  );
}
