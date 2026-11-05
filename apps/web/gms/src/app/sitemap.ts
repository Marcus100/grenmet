import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { sitemapPaths } from "@/lib/sitemap-paths";

/** The XML sitemap for search engines, built from the same navigation as the HTML sitemap. */
// Built from this environment's site address at request time (issue #1019).
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths().map((path) => ({
    url: new URL(path, env.NEXT_PUBLIC_SITE_URL).toString(),
  }));
}
