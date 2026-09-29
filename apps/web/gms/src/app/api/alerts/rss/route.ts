import { proxyCapFeed } from "@/lib/cap-feed";

/** Public CAP alerts as RSS, served from this site. */
export function GET() {
  return proxyCapFeed("/api/cap/rss.xml", "application/rss+xml; charset=utf-8");
}
