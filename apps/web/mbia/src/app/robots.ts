import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

const TRAILING_SLASHES = /\/+$/u;

/** The airport site is public and meant to be indexed: allow everything. */
export default function robots(): MetadataRoute.Robots {
  const base = env.NEXT_PUBLIC_SITE_URL.replace(TRAILING_SLASHES, "");
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${base}/sitemap.xml`,
  };
}
