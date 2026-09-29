import { proxyCapFeed } from "@/lib/cap-feed";

/** Active CAP alert areas as GeoJSON, served from this site. */
export function GET() {
  return proxyCapFeed("/api/cap/alerts.geojson", "application/geo+json");
}
