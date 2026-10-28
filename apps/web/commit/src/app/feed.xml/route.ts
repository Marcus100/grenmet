import { env } from "@/env";
import { getPosts } from "@/lib/content";
import { renderFeed } from "@/lib/feed";

// Posts are compiled at build time, so the feed is static.
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(renderFeed(env.COMMIT_SITE_URL, getPosts()), {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
