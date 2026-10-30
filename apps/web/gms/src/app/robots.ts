import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Public sites stay indexed (owner rule): every page is open to crawlers and
 * the sitemap is named. Pages that must stay out of search set `noindex`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", env.NEXT_PUBLIC_SITE_URL).toString(),
  };
}
