import type { MetadataRoute } from "next";
import { COVERAGE } from "@/data/coverage";
import { eventSlug } from "@/data/events";
import { GUIDES } from "@/data/learning";
import { data, people, results } from "@/data/load";
import { CODES, EVENTS, slugify } from "@/data/model";
import { partyRecords, partySlug } from "@/data/parties-history";
import { env } from "@/lib/env";
import { buildSitemap } from "@/lib/sitemap";

// The site is a static export (output: "export"): this file is written to out/sitemap.xml at build time.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(env.NEXT_PUBLIC_SITE_URL, {
    constituencySlugs: CODES.map((code) => slugify(results.cons[code][0])),
    candidateSlugs: people().map((person) => slugify(person.key)),
    partyCodes: partyRecords(data)
      .filter((record) => record.code !== "IND")
      .map((record) => partySlug(record.code)),
    electionSlugs: EVENTS.map((event) => eventSlug(event.id)),
    guideSlugs: GUIDES.map((guide) => guide.slug),
    updateSlugs: COVERAGE.map((post) => post.slug),
  });
}
