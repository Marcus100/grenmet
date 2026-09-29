"use client";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@barrelsgd/ui/components/ui/command";
import { FileTextIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  buildSearchIndex,
  type SearchArticle,
  searchIndex,
} from "@/lib/search";
import { cn } from "@/lib/utils";

const QUICK_LINKS = [
  "/alerts",
  "/weather",
  "/weather/radar",
  "/marine/forecast",
];

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** Published articles for search; an empty list whenever the feed fails. */
async function loadArticles(): Promise<SearchArticle[]> {
  try {
    const response = await fetch("/api/search");
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as { articles?: SearchArticle[] };
    return body.articles ?? [];
  } catch {
    return [];
  }
}

/**
 * Site search: every menu page plus published CMS articles, ranked locally
 * (`searchIndex`). Opens from the masthead button or the `/` key. Articles
 * load on first open; if the CMS is down, pages are still searchable.
 */
export function SiteSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState<SearchArticle[] | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && !isTyping(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open || articles !== null) {
      return;
    }
    loadArticles().then(setArticles);
  }, [open, articles]);

  const index = useMemo(() => buildSearchIndex(articles ?? []), [articles]);
  const results = useMemo(() => searchIndex(index, query), [index, query]);
  const quick = useMemo(
    () => index.filter((entry) => QUICK_LINKS.includes(entry.href)),
    [index]
  );

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const shown = query.trim() ? results : quick;

  return (
    <>
      <button
        aria-keyshortcuts="/"
        aria-label="Search the site"
        className={cn(
          "flex size-11 items-center justify-center rounded-md hover:bg-gm-text-inverse/10",
          className
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        <SearchIcon aria-hidden="true" className="size-5" />
      </button>
      <CommandDialog
        className="max-w-lg"
        description="Search pages, forecasts and articles"
        onOpenChange={setOpen}
        open={open}
        title="Search the GMS website"
      >
        {/* Our own ranking (searchIndex), so cmdk must not filter. */}
        <Command label="Search the GMS website" shouldFilter={false}>
          <CommandInput
            className="text-body-base leading-body-base"
            onValueChange={setQuery}
            placeholder="Search forecasts, places, topics…"
            value={query}
          />
          <CommandList className="max-h-96">
            <CommandEmpty className="py-6 text-center text-body leading-body">
              No pages match “{query}”.
            </CommandEmpty>
            {shown.length > 0 && (
              <CommandGroup heading={query.trim() ? "Results" : "Popular"}>
                {shown.map((entry) => (
                  <CommandItem
                    className="flex items-start gap-3 py-2"
                    key={entry.href}
                    onSelect={() => go(entry.href)}
                    value={entry.href}
                  >
                    {entry.kind === "article" && (
                      <FileTextIcon
                        aria-hidden="true"
                        className="mt-0.5 size-4 text-gm-sky-ink"
                      />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold text-body text-gm-heading leading-body">
                        {entry.title}
                      </span>
                      <span className="text-body-sm text-gm-text-secondary leading-body-sm">
                        {entry.section}
                        {entry.planned ? " · coming soon" : ""} ·{" "}
                        {entry.description}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
