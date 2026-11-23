import Link from "next/link";
import type { SetupStep } from "@/lib/setup-checklist";

const LINK =
  "text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-4";

/**
 * "Complete your setup" on the agenda for an owner or admin. Each step either
 * says it is done or links to where it is done. Its steps are all read from
 * saved data, so it needs no state of its own.
 */
export function SetupChecklist({
  orgSlug,
  steps,
}: Readonly<{ orgSlug: string; steps: SetupStep[] }>) {
  const done = steps.filter((step) => step.done).length;
  return (
    <section
      aria-labelledby="setup-heading"
      className="border-border space-y-3 rounded-lg border p-4"
    >
      <div className="space-y-1">
        <h2 className="text-base font-semibold" id="setup-heading">
          Complete your setup
        </h2>
        <p className="text-muted-foreground text-sm">
          {done} of {steps.length} steps done.
        </p>
      </div>
      <ol className="space-y-2">
        {steps.map((step) => (
          <li className="flex flex-wrap items-center gap-x-3" key={step.id}>
            {step.done ? (
              <>
                <span className="font-medium">{step.label}</span>
                <span className="text-muted-foreground text-sm">Done</span>
              </>
            ) : (
              <>
                <span>{step.label}</span>
                <Link
                  className={LINK}
                  href={`/studio/${orgSlug}/${step.target}`}
                >
                  Do this
                </Link>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
