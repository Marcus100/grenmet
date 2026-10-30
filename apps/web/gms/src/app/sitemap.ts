import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { sitemapPaths } from "@/lib/sitemap-paths";

/** The XML sitemap for search engines, built from the same navigation as the HTML sitemap. */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths().map((path) => ({
    url: new URL(path, env.NEXT_PUBLIC_SITE_URL).toString(),
  }));
}
