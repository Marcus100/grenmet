import type { Metadata } from "next";
import { AlertMap } from "@/components/alert-map";
import { FeedStatus } from "@/components/feed-status";
import { fetchActiveFeatures } from "@/lib/cap-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Alert map" };

export default async function MapPage() {
  const now = new Date();
  const result = await fetchActiveFeatures();
  const hasData = result.status === "ok" || result.status === "stale";

  return (
    <div className="space-y-5">
      <h1 className="text-gm-heading text-heading-lg font-semibold">
        Alert map
      </h1>
      <FeedStatus now={now} result={result} />
      {hasData && result.data.features.length === 0 ? (
        <p className="text-body text-gm-text-secondary">
          No weather alerts with a mapped area are in effect at the time shown
          above.
        </p>
      ) : null}
      {hasData && result.data.features.length > 0 ? (
        <AlertMap features={result.data.features} />
      ) : null}
    </div>
  );
}
