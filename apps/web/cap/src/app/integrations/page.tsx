import { Button } from "@grenmet/ui/components/ui/button";
import { FileText, MapIcon, Rss } from "lucide-react";
import { capPublicUrl } from "@/lib/cap-api";

export const metadata = {
  title: "Feeds",
};

const FEEDS = [
  {
    href: "/api/cap/rss.xml",
    icon: Rss,
    label: "RSS",
    value: "Active alert RSS feed",
  },
  {
    href: "/api/cap/alerts.geojson",
    icon: MapIcon,
    label: "GeoJSON",
    value: "Active alert feature collection",
  },
  {
    href: "/api/cap/latest-active",
    icon: FileText,
    label: "JSON",
    value: "Active alert JSON",
  },
];

export default function IntegrationsPage() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-gm-heading-md text-gm-text-primary leading-gm-heading-md">
        Public Feeds
      </h1>
      <div className="mt-6 grid gap-3">
        {FEEDS.map((feed) => (
          <article
            className="flex flex-col gap-4 border border-gm-border bg-white p-4 shadow-gm-card sm:flex-row sm:items-center sm:justify-between"
            key={feed.href}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-gm-6 bg-gm-surface-panel text-gm-navy">
                <feed.icon aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-gm-heading-sm text-gm-text-primary leading-gm-heading-sm">
                  {feed.label}
                </h2>
                <p className="text-gm-body text-gm-text-secondary leading-gm-body">
                  {feed.value}
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <a href={capPublicUrl(feed.href)}>Open</a>
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
