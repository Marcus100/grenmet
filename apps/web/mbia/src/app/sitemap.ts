import type { MetadataRoute } from "next";
import { getAllPages } from "@/lib/content";
import { env } from "@/lib/env";
import { buildSitemap } from "@/lib/sitemap-utils";

// Built from this environment's site address at request time (issue #1019).
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(getAllPages(), env.NEXT_PUBLIC_SITE_URL);
}
