import type { CapFeedImportPublic } from "@barrelsgd/api-client";
import { grenadaTime } from "@/components/desk/desk-panels";

/**
 * Flags a feed that still uses plain http. New feeds must be https on port 443.
 * An older feed keeps working until its grace period ends, then it is no longer
 * fetched. Always words, never colour alone.
 */
export function FeedSecurityFlag({
  feed,
}: {
  feed: Pick<
    CapFeedImportPublic,
    "grace_ends_at" | "grace_expired" | "insecure_since"
  >;
}) {
  if (!feed.insecure_since) return null;
  const ends = feed.grace_ends_at ? grenadaTime(feed.grace_ends_at) : null;
  if (feed.grace_expired) {
    return (
      <p
        className="bg-destructive/10 text-destructive text-body-sm rounded-md px-3 py-2 font-semibold"
        role="alert"
      >
        {`Plain http: this feed is no longer fetched${ends ? ` (since ${ends})` : ""}. Change the URL to https to start reading it again.`}
      </p>
    );
  }
  return (
    <p
      className="bg-warning-soft text-warning-soft-foreground text-body-sm rounded-md px-3 py-2 font-semibold"
      role="status"
    >
      {`Plain http: switch this feed to https${ends ? ` by ${ends}` : ""}. After that it is no longer fetched.`}
    </p>
  );
}
