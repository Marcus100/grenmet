import type { FeatureFlagAdmin } from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Skeleton } from "@barrelsgd/ui/components/ui/skeleton";
import { deleteFlagAction } from "@/app/(console)/flags/actions";
import { FlagForm } from "@/components/flag-form";
import { audienceSummary, instantToDate } from "@/lib/flag-form";

const DANGER =
  "rounded-md border border-destructive px-3 py-1.5 text-destructive text-sm hover:bg-muted";

/** The 30-second cache caveat, shown above the list and in the form. */
export function PropagationWarning() {
  return (
    <p className="max-w-3xl rounded-md border px-3 py-2 text-sm" role="note">
      Changes are saved at once on the worker that handled them, but other API
      workers cache flags for up to 30 seconds. Expect up to 30 seconds before a
      change reaches every request.
    </p>
  );
}

function FlagRow({ flag, stale }: { flag: FeatureFlagAdmin; stale: boolean }) {
  return (
    <li className="space-y-3 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium font-mono">{flag.key}</span>
        <Badge variant={flag.enabled ? "light-success" : "outline"}>
          {flag.enabled ? "Enabled" : "Disabled"}
        </Badge>
        <Badge variant="outline">{flag.exposed ? "Exposed" : "Internal"}</Badge>
        {stale ? <Badge variant="light-warning">Stale</Badge> : null}
      </div>
      {flag.description ? <p>{flag.description}</p> : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        <dt className="text-muted-foreground">Audience</dt>
        <dd>{audienceSummary(flag.audience)}</dd>
        <dt className="text-muted-foreground">Owner</dt>
        <dd>{flag.owner ?? "Not set"}</dd>
        <dt className="text-muted-foreground">Success metric</dt>
        <dd>{flag.success_metric ?? "Not set"}</dd>
        <dt className="text-muted-foreground">Review by</dt>
        <dd>{instantToDate(flag.review_by) || "Not set"}</dd>
        <dt className="text-muted-foreground">Expires</dt>
        <dd>{instantToDate(flag.expires_at) || "Never"}</dd>
      </dl>
      <details>
        <summary className="cursor-pointer font-medium">
          Edit {flag.key}
        </summary>
        <FlagForm flag={flag} />
        <form action={deleteFlagAction} className="mt-3">
          <input name="flag_id" type="hidden" value={flag.id} />
          <button className={DANGER} type="submit">
            Delete flag
          </button>
        </form>
      </details>
    </li>
  );
}

export function FlagsPanel({
  flags,
  staleIds,
}: {
  flags: FeatureFlagAdmin[];
  staleIds: readonly string[];
}) {
  return (
    <section aria-labelledby="flags-heading" className="space-y-2">
      <h2 className="font-medium" id="flags-heading">
        Flags ({flags.length})
      </h2>
      {flags.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          No feature flags yet. Create one to switch behaviour on for an
          audience.
        </p>
      ) : (
        <ul className="max-w-3xl space-y-2">
          {flags.map((flag) => (
            <FlagRow
              flag={flag}
              key={flag.id}
              stale={flag.stale || staleIds.includes(flag.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function NewFlag() {
  return (
    <details className="max-w-3xl rounded-md border p-3">
      <summary className="cursor-pointer font-medium text-sm">
        Create a flag
      </summary>
      <FlagForm />
    </details>
  );
}

export function FlagsLoading() {
  return (
    <section
      aria-busy="true"
      aria-labelledby="flags-heading"
      className="space-y-2"
    >
      <h2 className="font-medium" id="flags-heading">
        Flags
      </h2>
      <Skeleton className="h-24 max-w-3xl" />
      <span className="sr-only" role="status">
        Loading flags
      </span>
    </section>
  );
}

export function FlagsError() {
  return (
    <section aria-labelledby="flags-heading" className="space-y-2">
      <h2 className="font-medium" id="flags-heading">
        Flags
      </h2>
      <p className="rounded-md border px-3 py-2 text-sm" role="alert">
        Problem: the flags could not be loaded. Reload the page to try again.
      </p>
    </section>
  );
}
