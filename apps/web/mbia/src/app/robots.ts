import { robotsRules } from "@barrelsgd/ui/lib/seo";
import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * The airport site is public and meant to be indexed. Only the sign-in
 * callbacks, the contact endpoint and the runtime config are kept out of search.
 */
const PRIVATE_DISALLOW = ["/api/", "/auth/", "/runtime-env.js"];

// Built from this environment's site address at request time (issue #1019).
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return robotsRules({
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    disallow: PRIVATE_DISALLOW,
  });
}
