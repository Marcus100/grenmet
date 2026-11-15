import { robotsRules } from "@barrelsgd/ui/lib/seo";
import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { PRIVATE_DISALLOW } from "@/lib/sitemap";

// Built from this environment's site address at request time (issue #1019).
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return robotsRules({
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    disallow: PRIVATE_DISALLOW,
  });
}
