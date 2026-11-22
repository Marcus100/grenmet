import { allHurricanepages } from "content-collections";
import type { Metadata, Route } from "next";
import Link from "next/link";

import { DocsSearchForm } from "@/components/DocsSearchForm";
import { type DocPage, MAX_QUERY_LENGTH, searchPages } from "@/lib/page-search";
import { pagePath } from "@/lib/sitemap";

export const metadata: Metadata = {
  title: "Search",
  description: "Find a page in the GMS documentation.",
  // Search result pages are not worth indexing; the pages they link to are.
  robots: { index: false, follow: true },
};

/** `/search?q=`: finds documentation pages by title and description. */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const query =
    (Array.isArray(q) ? q[0] : q)?.trim().slice(0, MAX_QUERY_LENGTH) ?? "";
  const pages: DocPage[] = allHurricanepages.map((page) => ({
    description: page.description,
    path: pagePath(page._meta.path),
    title: page.title,
  }));
  const results = query ? searchPages(pages, query) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
        Search the documentation
      </h1>
      <DocsSearchForm defaultValue={query} />
      {query === "" && (
        <p className="text-base text-zinc-600 dark:text-zinc-400">
          Type a word, such as “hurricane” or “vehicles”, to find a page.
        </p>
      )}
      {query !== "" && results.length === 0 && (
        <p
          className="rounded-md border border-zinc-300 p-4 text-base text-zinc-700 dark:text-zinc-300"
          role="status"
        >
          No pages match “{query}”. Try a shorter word, or go to the{" "}
          <Link className="underline" href={"/" as Route}>
            documentation home
          </Link>
          .
        </p>
      )}
      {results.length > 0 && (
        <ul className="space-y-3">
          {results.map((page) => (
            <li
              className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
              key={page.path}
            >
              <Link
                className="text-base font-semibold text-zinc-900 underline dark:text-white"
                href={page.path as Route}
              >
                {page.title}
              </Link>
              {page.description && (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {page.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
