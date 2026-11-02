import { ShieldAlertIcon } from "lucide-react";
import Link from "next/link";
import { fetchPublicAlert } from "@/lib/cap";
import { cn } from "@/lib/utils";
import { toWarningDetail, warningHref } from "@/lib/warning-detail";

const FRAME =
  "flex flex-col gap-2 rounded-gm-card border border-gm-border bg-gm-surface p-4";

/**
 * An official warning attached to an editorial post. Its words come live from
 * the warning system; the CMS stores only its identifier. Status chips are
 * neutral, never hazard colours.
 */
export async function LinkedAlert({
  className,
  identifier,
}: {
  className?: string;
  identifier: string;
}) {
  const result = await fetchPublicAlert(identifier);
  if (result.status !== "ok") {
    return (
      <p className={cn(FRAME, className)} role="status">
        {result.status === "not-found"
          ? "The warning this post refers to is no longer published."
          : "The warning this post refers to can't be loaded right now."}{" "}
        <Link className="text-gm-blue-ink underline" href="/alerts">
          See alerts in effect
        </Link>
      </p>
    );
  }
  const detail = toWarningDetail(result.alert);
  if (!detail) return null;
  return (
    <aside
      aria-label={`Official warning: ${detail.event}`}
      className={cn(FRAME, className)}
    >
      <p className="text-gm-heading text-label leading-label flex flex-wrap items-center gap-2 font-bold tracking-wider uppercase">
        <ShieldAlertIcon aria-hidden="true" className="size-4" />
        Official warning
        <span className="bg-gm-surface-panel text-caption leading-caption rounded-full px-2 py-0.5 font-bold tracking-normal normal-case">
          {detail.ended ? "Ended" : "In effect"}
        </span>
      </p>
      <p className="text-body-base text-gm-heading leading-body-base font-bold">
        {detail.headline}
      </p>
      {detail.areas.length > 0 && (
        <p className="text-body leading-body">{detail.areas.join(", ")}</p>
      )}
      {detail.expires && !detail.ended && (
        <p className="text-body-sm text-gm-text-secondary leading-body-sm">
          Until {detail.expires}
        </p>
      )}
      <Link
        className="text-body text-gm-blue-ink leading-body w-fit font-semibold underline"
        href={warningHref(identifier) as never}
      >
        Read the warning
      </Link>
    </aside>
  );
}
