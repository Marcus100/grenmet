import {
  CapAdminHeading,
  CapAdminUnavailable,
} from "@/components/cap/admin-status";
import { CapFeedManager } from "@/components/cap/feed-manager";
import { loadCapFeeds } from "@/db/cap/queries";

export default async function FeedsPage() {
  let feeds: Awaited<ReturnType<typeof loadCapFeeds>>;
  try {
    feeds = await loadCapFeeds();
  } catch {
    return <CapAdminUnavailable />;
  }
  return (
    <CapAdminHeading title="External CAP feeds">
      <CapFeedManager feeds={feeds} />
    </CapAdminHeading>
  );
}
