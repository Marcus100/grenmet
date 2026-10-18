import { proxyFeed } from "@/lib/feed-proxy";

export function GET() {
  return proxyFeed(
    "/api/cap/alerts.geojson",
    "application/geo+json; charset=utf-8"
  );
}
