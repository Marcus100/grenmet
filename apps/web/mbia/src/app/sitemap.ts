import type { MetadataRoute } from "next";
import { getAllPages } from "@/lib/content";
import { env } from "@/lib/env";
import { buildSitemap } from "@/lib/sitemap-utils";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(getAllPages(), env.NEXT_PUBLIC_SITE_URL);
}
