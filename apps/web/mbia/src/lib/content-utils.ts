import type { Section } from "@/lib/nav";

/**
 * Pure query helpers over the generated pages collection. Kept free of the
 * `content-collections` import so component tests can use them without the
 * generated module existing.
 */

export interface PageDoc {
  dek: string;
  draft: boolean;
  heroAlt?: string;
  heroImage?: string;
  publishedAt?: string;
  section: Section;
  slug: string;
  title: string;
}

export function pagesInSection<T extends PageDoc>(
  pages: T[],
  section: Section
): T[] {
  return pages
    .filter((p) => p.section === section && !p.draft)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function newsByDate<T extends PageDoc>(pages: T[]): T[] {
  return pages
    .filter((p) => p.section === "news" && !p.draft)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

export function findPage<T extends PageDoc>(
  pages: T[],
  section: Section,
  slug: string
): T | undefined {
  return pages.find(
    (p) => p.section === section && p.slug === slug && !p.draft
  );
}

export function formatDate(iso: string | undefined): string {
  if (!iso) {
    return "";
  }
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
