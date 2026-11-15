import type { MetadataRoute } from "next";
import { env } from "@/env";
import { buildSitemap } from "@/lib/sitemap";

// Built from this environment's site address at request time (issue #1019).
export const dynamic = "force-dynamic";

/** The deploy sets NEXT_PUBLIC_SITE_URL; this is the production address if it is unset. */
const FALLBACK_SITE_URL = "https://bookings.barrels.gd";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL);
}
