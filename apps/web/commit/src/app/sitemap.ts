import type { MetadataRoute } from "next";
import { env } from "@/env";
import { getPosts } from "@/lib/content";

// Written once at build time (static export).
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: env.COMMIT_SITE_URL, lastModified: getPosts()[0]?.date }];
}
