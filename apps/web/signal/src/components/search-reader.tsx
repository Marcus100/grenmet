"use client";
import Link from "next/link";
import { useState } from "react";
import { type SearchEntry, searchEntries } from "@/lib/discovery";
export function SearchReader({ entries }: { entries: SearchEntry[] }) {
  const [query, setQuery] = useState("");
  const results = searchEntries(entries, query);
  return (
    <section>
      <label className="block font-semibold text-base" htmlFor="story-search">
        Search stories and editions
      </label>
      <input
        autoComplete="off"
        className="mt-3 min-h-12 w-full border border-signal-ink bg-background px-4 py-3 text-lg"
        id="story-search"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Try weather, scholarships or fact check"
        type="search"
        value={query}
      />
      <p className="mt-3 text-sm">
        Search happens on your device. Your words are not sent to a server.
      </p>
      <p aria-live="polite" className="my-6 text-base" role="status">
        {query.trim()
          ? `${results.length} ${results.length === 1 ? "result" : "results"}`
          : "Type a topic, name or phrase to begin."}
      </p>
      {query.trim() && !results.length ? (
        <p className="border-signal-rule border-t py-6 text-lg">
          No matches for “{query.trim()}”. Try fewer words or{" "}
          <Link className="text-signal-green underline" href="/topics">
            browse the topics
          </Link>
          .
        </p>
      ) : null}
      <ul className="divide-y divide-signal-rule">
        {results.map((entry) => (
          <li className="py-6" key={entry.href}>
            <p className="text-signal-green text-sm">{entry.label} · Demo</p>
            <h2 className="mt-2 font-semibold font-serif text-2xl">
              <Link
                className="hover:text-signal-green hover:underline"
                href={entry.href}
                prefetch={false}
              >
                {entry.title}
              </Link>
            </h2>
            <p className="mt-3 text-lg leading-relaxed">{entry.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
