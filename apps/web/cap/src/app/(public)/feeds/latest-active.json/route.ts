import { proxyFeed } from "@/lib/feed-proxy";

export function GET() {
  return proxyFeed("/api/cap/latest-active", "application/json; charset=utf-8");
}
