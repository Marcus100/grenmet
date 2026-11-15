import type { MetadataRoute } from "next";
import { getBriefs, getPublishedArticles } from "@/lib/content";
import { COLLECTIONS } from "@/lib/discovery";
import { env } from "@/lib/env";
import { buildSitemap } from "@/lib/sitemap";

// Built from this environment's site address at request time (issue #1019).
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(env.NEXT_PUBLIC_SITE_URL, {
    articles: getPublishedArticles(),
    briefDates: getBriefs().map((brief) => brief.date),
    collectionSlugs: COLLECTIONS.map((collection) => collection.slug),
  });
}
