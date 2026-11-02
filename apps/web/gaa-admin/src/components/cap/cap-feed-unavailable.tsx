/**
 * Shown in place of CAP data when the feed cannot be read. It says so in
 * words: an outage is never an empty list, and never an all-clear.
 */
export function CapFeedUnavailable({ feed }: { feed: string }) {
  return (
    <p
      className="border-gm-risk-red bg-card text-body text-gm-text-primary rounded-md border p-4"
      role="alert"
    >
      {feed} cannot be retrieved right now. This does not mean there are no
      active CAP alerts. Check the CAP feed before relying on this view.
    </p>
  );
}
