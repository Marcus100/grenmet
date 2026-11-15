import { robotsRules } from "@barrelsgd/ui/lib/seo";
import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// The site is a static export (output: "export"): this file is written to out/robots.txt at build time.
export const dynamic = "force-static";

/** Every page is public; there are no staff, account or token pages in this export. */
export default function robots(): MetadataRoute.Robots {
  return robotsRules({ siteUrl: env.NEXT_PUBLIC_SITE_URL, disallow: [] });
}
