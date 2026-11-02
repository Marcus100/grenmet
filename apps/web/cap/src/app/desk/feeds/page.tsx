import type { Metadata } from "next";
import {
  DeskForbidden,
  DeskRefused,
  DeskUnavailable,
} from "@/components/desk/desk-panels";
import { FeedManager } from "@/components/desk/feed-manager";
import { listFeeds } from "@/lib/desk/api";
import { requireDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Feeds" };
export const dynamic = "force-dynamic";

export default async function FeedsPage() {
  const gate = await requireDeskGate("/desk/feeds");
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;
  if (!gate.permissions.feedsManage) {
    return <DeskForbidden permission="cap.feed.manage" what="feed sources" />;
  }
  let feeds: Awaited<ReturnType<typeof listFeeds>>;
  try {
    feeds = await listFeeds(gate.accessToken);
  } catch (error) {
    reportError(error, "cap-desk-feeds");
    return <DeskUnavailable what="Feed sources" />;
  }
  return (
    <div className="space-y-6">
      <h1 className="font-semibold text-2xl">External CAP feeds</h1>
      <FeedManager feeds={feeds} />
    </div>
  );
}
