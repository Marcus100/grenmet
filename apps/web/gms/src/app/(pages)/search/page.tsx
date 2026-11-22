import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { SiteSearchForm } from "@/components/site-search-form";
import { buildSearchIndex, MAX_QUERY_LENGTH, searchIndex } from "@/lib/search";
import { loadSearchArticles } from "@/lib/search-articles";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Search",
  description: "Find a page, forecast or article on the GMS website.",
  // Search result pages are not worth indexing; the pages they link to are.
  robots: { index: false, follow: true },
};

const RESULT_LIMIT = 20;

/**
 * `/search?q=`: the same ranking as the site search dialog (`searchIndex`),
 * rendered on the server so it works without JavaScript. The query comes from
 * the address; nothing is stored or sent to analytics.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const raw = Array.isArray(q) ? (q[0] ?? "") : (q ?? "");
  const query = raw.trim().slice(0, MAX_QUERY_LENGTH);
  const results = query
    ? searchIndex(
        buildSearchIndex(await loadSearchArticles()),
        query,
        RESULT_LIMIT
      )
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        description="Find a page, forecast or article."
        title="Search"
      />
      <SiteSearchForm defaultValue={query} />
      {query === "" && (
        <p className="text-body-base leading-body-base text-gm-text-secondary">
          Type a word, such as “radar” or “marine”, to find a page.
        </p>
      )}
      {query !== "" && results.length === 0 && (
        <p
          className="rounded-gm-card border-gm-border text-body-base leading-body-base border p-4"
          role="status"
        >
          No pages match “{query}”. Try a shorter word, or browse the{" "}
          <Link className="underline underline-offset-4" href="/sitemap">
            sitemap
          </Link>
          .
        </p>
      )}
      {results.length > 0 && (
        <PageSection heading={`Results for “${query}”`}>
          <ul className="space-y-3">
            {results.map((entry) => (
              <li
                className="rounded-gm-card border-gm-border bg-background flex flex-col gap-1 border p-4"
                key={entry.href}
              >
                <Link
                  className="text-body-base text-gm-heading leading-body-base hover:text-gm-blue-ink font-bold underline underline-offset-4"
                  href={entry.href as Route}
                >
                  {entry.title}
                </Link>
                <p className="text-body-sm text-gm-text-secondary leading-body-sm">
                  {entry.section}
                  {entry.planned ? " · coming soon" : ""}
                  {" · "}
                  {entry.description}
                </p>
              </li>
            ))}
          </ul>
        </PageSection>
      )}
    </div>
  );
}
