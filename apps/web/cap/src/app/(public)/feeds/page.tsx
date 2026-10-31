import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

const TRAILING_SLASH = /\/$/;

export const metadata: Metadata = { title: "Alert feeds" };

const FEEDS = [
  {
    description:
      "Active alerts as JSON, in the same shape as the Barrels alert API.",
    href: "/feeds/latest-active.json",
    name: "Active alerts (JSON)",
  },
  {
    description:
      "RSS 2.0 listing active alerts and cancellations from the last 24 hours. Each item links to its CAP XML document.",
    href: "/feeds/rss.xml",
    name: "RSS",
  },
  {
    description:
      "Areas under active alerts as a GeoJSON feature collection, for map clients.",
    href: "/feeds/alerts.geojson",
    name: "GeoJSON",
  },
] as const;

export default function FeedsPage() {
  const site = env.NEXT_PUBLIC_SITE_URL.replace(TRAILING_SLASH, "");
  return (
    <div className="space-y-6">
      <h1 className="font-semibold text-gm-heading text-heading-lg">
        Alert feeds
      </h1>
      <p className="text-body">
        These feeds are for apps, broadcasters and other agencies. Everyone else
        should use the{" "}
        <Link className="text-gm-blue-ink underline" href="/">
          active alerts page
        </Link>
        .
      </p>

      <section aria-labelledby="cap" className="space-y-2">
        <h2 className="font-semibold text-gm-heading text-heading-sm" id="cap">
          CAP 1.2 (the standard format)
        </h2>
        <p className="text-body">
          Every alert is published as a Common Alerting Protocol 1.2 XML
          document, the format used by the WMO Alert Hub and by Google and other
          aggregators. Find a document through the RSS feed, or from the alert's
          page.
        </p>
        <p className="font-mono text-body-sm">
          {site}/feeds/alerts/&lt;identifier&gt;.xml
        </p>
      </section>

      <ul className="space-y-3">
        {FEEDS.map((feed) => (
          <li
            className="rounded-gm-card border border-gm-border p-3"
            key={feed.href}
          >
            <a
              className="font-semibold text-gm-blue-ink underline"
              href={feed.href}
            >
              {feed.name}
            </a>
            <p className="mt-1 text-body-sm text-gm-text-secondary">
              {feed.description}
            </p>
            <p className="mt-1 font-mono text-caption text-gm-text-muted">
              {site}
              {feed.href}
            </p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="agg" className="space-y-2">
        <h2 className="font-semibold text-gm-heading text-heading-sm" id="agg">
          For aggregators and the WMO Alert Hub
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-body">
          <li>
            Poll the RSS feed no more often than every 30 seconds; feeds are
            cached for that long.
          </li>
          <li>
            Treat the CAP document as authoritative. Honour Update and Cancel
            messages through their references.
          </li>
          <li>
            If a feed returns an error, keep your last good copy until the
            alert's expiry time. The service answers 503 when it cannot read the
            alert data.
          </li>
          <li>
            Registration of this source with the WMO Alert Hub is handled by the
            Grenada Meteorological Service.
          </li>
        </ul>
      </section>
    </div>
  );
}
