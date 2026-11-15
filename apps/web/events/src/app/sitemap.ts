import type { MetadataRoute } from "next";
import { listEvents, listGroups } from "@/data/events-api";
import { env } from "@/env";
import { reportError } from "@/lib/report-error";
import { buildSitemap } from "@/lib/sitemap";

// Built from this environment's site address at request time (issue #1019).
export const dynamic = "force-dynamic";

/**
 * Static pages always; upcoming events and groups when the API answers. An API
 * failure is reported and the sitemap falls back to the static pages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let events: Awaited<ReturnType<typeof listEvents>> = [];
  let groups: Awaited<ReturnType<typeof listGroups>> = [];
  try {
    [events, groups] = await Promise.all([listEvents({}), listGroups()]);
  } catch (error) {
    reportError(error, "events-sitemap");
  }
  return buildSitemap(env.NEXT_PUBLIC_SITE_URL, { events, groups });
}
