import { allHurricanepages } from "content-collections";
import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { buildSitemap } from "@/lib/sitemap";

// Built from this environment's site address at request time (issue #1019).
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(
    env.NEXT_PUBLIC_SITE_URL,
    allHurricanepages.map((page) => page._meta.path)
  );
}
