import { Document } from "flexsearch";

import sectionsData from "@/data/sections.json";

export interface Result {
  pageTitle?: string;
  title: string;
  url: string;
  [key: string]: unknown;
}

interface SectionEntry {
  id: string;
  tag?: string;
  title: string;
}

interface PageEntry {
  pageTitle: string | null;
  sections: SectionEntry[];
}

interface EnrichedResult {
  doc: { title: string; pageTitle?: string };
  id: unknown;
}

// biome-ignore lint/suspicious/noExplicitAny: FlexSearch Document generics require index signatures not suitable for internal use
const index = new Document<any, any>({
  tokenize: "full",
  document: {
    id: "url",
    index: "content",
    store: ["title", "pageTitle"],
  },
  context: {
    resolution: 9,
    depth: 2,
    bidirectional: true,
  },
});

for (const [pathname, page] of Object.entries(
  sectionsData as Record<string, PageEntry>
)) {
  if (page.pageTitle) {
    index.add({
      url: pathname,
      content: page.pageTitle,
      title: page.pageTitle,
    });
  }
  for (const section of page.sections) {
    index.add({
      url: `${pathname}#${section.id}`,
      content: section.title,
      title: section.title,
      pageTitle: page.pageTitle ?? undefined,
    });
  }
}

export function search(
  query: string,
  options: { limit?: number } = {}
): Result[] {
  // biome-ignore lint/suspicious/noExplicitAny: FlexSearch enrich results require casting
  const results = index.search(query, { ...options, enrich: true }) as any[];
  if (!results.length) return [];
  return (results[0].result as EnrichedResult[]).map((item) => ({
    url: String(item.id),
    title: item.doc.title,
    pageTitle: item.doc.pageTitle,
  }));
}
