import type { Metadata } from "next";
import Link from "next/link";
import { AlertMap } from "@/components/alert-map";
import { FeedStatus } from "@/components/feed-status";
import { fetchActiveFeatures } from "@/lib/cap-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Alert map",
  description:
    "Map of active weather alerts for Grenada, Carriacou and Petite Martinique.",
  alternates: { canonical: "/map" },
};

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
      {/* Always draw the islands, so an empty map never looks like a failed one. */}
      {hasData ? <AlertMap features={result.data.features} /> : null}
      {hasData && result.data.features.length === 0 ? (
        <section
          aria-labelledby="map-alerts-heading"
          className="rounded-gm-card border-gm-border bg-gm-surface space-y-2 border p-4"
        >
          <h2
            className="text-heading-sm text-gm-heading font-semibold"
            id="map-alerts-heading"
          >
            Alerts on this map
          </h2>
          <ul className="text-body text-gm-text-secondary list-disc space-y-1 pl-5">
            <li>No alert area is in effect at the time shown above.</li>
            <li>
              Warnings without a mapped area, if any, are listed on the{" "}
              <Link className="text-gm-blue-ink underline" href="/">
                active alerts
              </Link>{" "}
              page.
            </li>
          </ul>
        </section>
      ) : null}
    </div>
  );
}
