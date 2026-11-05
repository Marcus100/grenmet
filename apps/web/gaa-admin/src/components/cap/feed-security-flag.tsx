import { Badge } from "@barrelsgd/ui/components/ui/badge";

/** The plain-http fields of a feed (`CapFeedImportPublic`). Absent for https feeds. */
export interface FeedSecurityFields {
  grace_ends_at?: string | null;
  grace_expired?: boolean;
  insecure_since?: string | null;
}

/** Calendar day (UTC) of an API timestamp, so the text does not depend on locale. */
function day(value: string): string {
  return value.slice(0, 10);
}

/**
 * Flags a feed that still uses plain http. New feeds must be https on port 443.
 * An older feed keeps working until its grace period ends, then it is no longer
 * fetched. Always a text label, never colour alone.
 */
export function FeedSecurityFlag({ feed }: { feed: FeedSecurityFields }) {
  if (!feed.insecure_since) {
    return null;
  }
  if (feed.grace_expired) {
    return (
      <Badge variant="destructive">
        Plain http: no longer fetched
        {feed.grace_ends_at ? ` since ${day(feed.grace_ends_at)}` : ""}. Change
        the URL to https.
      </Badge>
    );
  }
  return (
    <Badge variant="light-warning">
      Plain http: switch to https
      {feed.grace_ends_at ? ` by ${day(feed.grace_ends_at)}` : ""} or this feed
      stops being fetched.
    </Badge>
  );
}
