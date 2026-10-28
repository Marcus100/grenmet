import type { MetadataRoute } from "next";
import { env } from "@/env";

// Written once at build time (static export).
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${env.COMMIT_SITE_URL}/sitemap.xml`,
  };
}
