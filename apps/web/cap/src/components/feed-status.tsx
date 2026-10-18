import { StaleGuard } from "@/components/stale-guard";
import { formatClock, freshness, STALE_AFTER_MINUTES } from "@/lib/alerts";
import type { FeedResult } from "@/lib/feed-client";

/**
 * The honest state of the data behind a page: when it was last read, whether
 * that is the last-known-good copy, or that the service cannot be reached.
 * Rendered above any alert content so it is never missed.
 */
export function FeedStatus({
  result,
  now,
}: {
  result: FeedResult<unknown>;
  now: Date;
}) {
  if (result.status === "unavailable") {
    return <Unreachable />;
  }
  if (result.status === "not-found") {
    return null;
  }

  const clock = formatClock(result.fetchedAt);
  const { stale } = freshness(result.fetchedAt, now);

  if (result.status === "stale" || stale) {
    return (
      <p
        className="rounded-gm-card border border-gm-warning-amber-border bg-gm-warning-amber-bg p-3 text-body-sm text-gm-warning-amber-fg"
        role="status"
      >
        <strong>Live updates are not reachable right now.</strong> This is the
        last information we received, at {clock} (Grenada time). Alerts issued
        since may be missing. Check GMS announcements on radio and TV.
      </p>
    );
  }

  return (
    <>
      <p className="text-body-sm text-gm-text-secondary">
        Last updated{" "}
        <time dateTime={result.fetchedAt.toISOString()}>{clock}</time> (Grenada
        time)
      </p>
      <StaleGuard
        clock={clock}
        renderedAt={result.fetchedAt.toISOString()}
        staleAfterMinutes={STALE_AFTER_MINUTES}
      />
    </>
  );
}

/** Shown instead of content when there is no data at all, not even old data. */
export function Unreachable() {
  return (
    <div
      className="rounded-gm-card border border-gm-warning-grey-border bg-gm-warning-grey-bg p-4 text-gm-warning-grey-fg"
      role="alert"
    >
      <h2 className="font-semibold text-heading-sm">
        Alert service temporarily unreachable
      </h2>
      <p className="mt-1 text-body">
        We cannot confirm whether any weather alerts are in effect. This is not
        an all-clear. Check GMS radio and TV announcements, and follow guidance
        from local authorities.
      </p>
    </div>
  );
}
