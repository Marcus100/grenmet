import { proxyFeed } from "@/lib/feed-proxy";

export function GET() {
  return proxyFeed("/api/cap/rss.xml", "application/rss+xml; charset=utf-8");
}
