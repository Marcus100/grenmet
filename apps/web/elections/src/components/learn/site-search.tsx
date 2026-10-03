"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type SiteSearchEntry, searchSite } from "@/data/site-search";
import { reportError } from "@/lib/report-error";
export function SiteSearch() {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SiteSearchEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    fetch("/site-search.json", {
      signal: controller.signal,
      cache: attempt > 0 ? "reload" : "default",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Search index ${response.status}`);
        const rows: SiteSearchEntry[] = await response.json();
        if (!controller.signal.aborted) setIndex(rows);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          reportError(error, "site-search");
          setFailed(true);
        }
      });
    return () => controller.abort();
  }, [attempt]);
  const matches = index ? searchSite(index, query) : [];
  let status =
    "No matches. Try a year, surname or a shorter topic such as turnout.";
  if (index === null) status = "Loading the search index…";
  else if (query.trim().length < 2) status = "Enter at least two characters.";
  else if (matches.length)
    status = `${matches.length} result${matches.length === 1 ? "" : "s"} shown`;
  return (
    <div className="max-w-3xl">
      <label className="font-semibold" htmlFor="site-query">
        Search questions, people, parties and elections
      </label>
      <input
        className="mt-3 h-12 w-full rounded-md border border-el-rule-2 bg-background px-4 text-base"
        id="site-query"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Try turnout, 2022, or a candidate’s name"
        type="search"
        value={query}
      />
      <p className="mt-2 text-el-muted text-sm">
        Search is performed on this device. Queries are not sent to a search
        service.
      </p>
      <div aria-live="polite" className="mt-4 text-sm">
        {failed ? (
          <p>
            Search could not load.{" "}
            <button
              className="underline"
              onClick={() => setAttempt((n) => n + 1)}
              type="button"
            >
              Try again
            </button>{" "}
            or{" "}
            <Link className="underline" href="/learn">
              browse the guides
            </Link>
            .
          </p>
        ) : (
          status
        )}
      </div>
      <ul className="mt-4 divide-y divide-el-rule">
        {matches.map((entry) => (
          <li
            className="py-4"
            key={`${entry.kind}:${entry.title}:${entry.href}`}
          >
            <p className="text-el-muted text-xs">{entry.kind}</p>
            <Link
              className="font-semibold font-serif text-xl underline-offset-4 hover:underline"
              href={entry.href}
            >
              {entry.title}
            </Link>
            <p className="mt-1 text-el-ink-2 text-sm">{entry.summary}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
