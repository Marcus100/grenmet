"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { type SearchEntry, searchConstituencies } from "@/data/search";
import { reportError } from "@/lib/report-error";

let indexPromise: Promise<SearchEntry[]> | null = null;

/** Fetch the search index once per page load, on first use. */
function loadIndex(): Promise<SearchEntry[]> {
  indexPromise ??= fetch("/search-index.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Search index ${response.status}`);
      return response.json() as Promise<SearchEntry[]>;
    })
    .catch((error: unknown) => {
      indexPromise = null;
      reportError(error, "constituency-search");
      return [];
    });
  return indexPromise;
}

const KIND_LABEL = {
  constituency: "Constituency",
  place: "Place",
  person: "Person",
} as const;

/**
 * "Find your constituency": type a village, polling place, constituency or
 * name and go to that constituency's page. An ARIA combobox: arrows move, Enter opens,
 * Escape clears.
 */
export function ConstituencySearch({
  size = "compact",
  className,
  autoFocus,
}: {
  size?: "compact" | "large";
  className?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const matches = index ? searchConstituencies(index, query) : [];
  const showList = open && query.trim().length >= 2;

  function prime() {
    if (!index) loadIndex().then(setIndex);
  }

  function go(entry: SearchEntry | undefined) {
    if (!entry) return;
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(entry.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(matches[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  const large = size === "large";

  return (
    <div className={cn("relative", className)}>
      <SearchIcon
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-el-muted",
          large ? "left-3.5 size-5" : "left-2.5 size-4"
        )}
      />
      <input
        aria-activedescendant={
          showList && matches[active] ? `${listId}-${active}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showList}
        aria-label="Find your constituency: village, constituency or name"
        autoComplete="off"
        autoFocus={autoFocus}
        className={cn(
          "w-full rounded-md border border-el-rule-2 bg-background text-el-ink placeholder:text-el-muted",
          large ? "h-12 pr-4 pl-11 text-base" : "h-9 pr-3 pl-8 text-sm"
        )}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          prime();
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onPointerEnter={prime}
        placeholder={
          large
            ? "Type your village, constituency or MP"
            : "Find your constituency"
        }
        ref={inputRef}
        role="combobox"
        type="search"
        value={query}
      />
      {showList && (
        <div
          aria-label="Matching constituencies"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-50 max-h-80 overflow-auto rounded-md border border-el-rule-2 bg-background p-1 shadow-[0_12px_32px_rgb(0_0_0/0.14)]"
          id={listId}
          role="listbox"
        >
          {index === null && (
            <p className="px-3 py-2 text-el-muted text-sm">Loading…</p>
          )}
          {index !== null && matches.length === 0 && (
            <p className="px-3 py-2 text-el-muted text-sm">
              No constituency matches “{query.trim()}”.
            </p>
          )}
          {matches.map((entry, i) => (
            <div
              aria-selected={i === active}
              className={cn(
                "flex cursor-pointer flex-col rounded px-3 py-2",
                i === active && "bg-el-paper-2"
              )}
              id={`${listId}-${i}`}
              key={`${entry.kind}${entry.label}${entry.href}`}
              onMouseDown={(event) => {
                event.preventDefault();
                go(entry);
              }}
              onMouseEnter={() => setActive(i)}
              role="option"
              tabIndex={-1}
            >
              <span className="text-el-ink text-sm">
                {entry.label}
                <span className="ml-2 font-semibold text-[10px] text-el-muted uppercase tracking-[0.07em]">
                  {KIND_LABEL[entry.kind]}
                </span>
              </span>
              <span className="text-el-muted text-xs">{entry.note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
