import type { MetadataRoute } from "next";
import { toAlertView } from "@/lib/alerts";
import { fetchActive, fetchPast } from "@/lib/cap-api";
import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";
import { buildSitemap } from "@/lib/sitemap";

// Built from this environment's site address at request time (issue #1019).
export const dynamic = "force-dynamic";

/**
 * Static pages always; alert pages for current and past alerts when the feed
 * answers. A feed failure is reported and the sitemap keeps the static pages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const identifiers: string[] = [];
  try {
    const [active, past] = await Promise.all([fetchActive(), fetchPast()]);
    for (const result of [active, past]) {
      if (result.status !== "ok" && result.status !== "stale") {
        continue;
      }
      for (const alert of result.data) {
        if (toAlertView(alert)) {
          identifiers.push(alert.identifier);
        }
      }
    }
  } catch (error) {
    reportError(error, "cap-sitemap");
  }
  return buildSitemap(env.NEXT_PUBLIC_SITE_URL, identifiers);
}
