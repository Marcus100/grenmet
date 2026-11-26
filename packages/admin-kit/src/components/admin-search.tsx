"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@barrelsgd/ui/components/ui/command";
import { Search } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import {
  type AdminNavGroup,
  type AdminSearchEntry,
  getSearchEntries,
} from "../lib/navigation";

export interface AdminSearchProps {
  /**
   * Pages that are reachable but deliberately not in the sidebar (settings,
   * exports). They stay findable here.
   */
  readonly extraEntries?: readonly AdminSearchEntry[];
  /** Heading for top-level items of groups without a label. */
  readonly fallbackGroup?: string;
  readonly navigation: readonly AdminNavGroup[];
  readonly placeholder?: string;
}

function groupEntries(entries: readonly AdminSearchEntry[]) {
  const names = [...new Set(entries.map((entry) => entry.group))];
  return names.map((group) => ({
    group,
    entries: entries.filter((entry) => entry.group === group),
  }));
}

/**
 * The command palette, built from the same navigation config as the sidebar.
 * Opens from the button, or with ⌘K / Ctrl+K anywhere on the page.
 */
export function AdminSearch({
  extraEntries = [],
  fallbackGroup,
  navigation,
  placeholder = "Search pages…",
}: AdminSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const entries = [
    ...getSearchEntries(navigation, fallbackGroup),
    ...extraEntries,
  ];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setQuery("");
    }
  };

  const handleSelect = (entry: AdminSearchEntry) => {
    if (entry.disabled) {
      return;
    }
    handleOpenChange(false);
    if (entry.newTab) {
      window.open(entry.url, "_blank", "noopener,noreferrer");
    } else {
      router.push(entry.url as Route);
    }
  };

  return (
    <>
      <Button
        aria-keyshortcuts="Control+K Meta+K"
        className="text-muted-foreground px-0! font-normal hover:no-underline pointer-coarse:min-h-11"
        onClick={() => handleOpenChange(true)}
        variant="link"
      >
        <Search data-icon="inline-start" />
        Search
        <kbd className="bg-muted hidden h-5 items-center gap-1 rounded border px-1.5 text-[10px] font-medium select-none sm:inline-flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog
        description="Type to find a page, then press Enter to open it."
        onOpenChange={handleOpenChange}
        open={open}
        title="Search"
      >
        <Command>
          <CommandInput
            onValueChange={setQuery}
            placeholder={placeholder}
            value={query}
          />
          <CommandList>
            <CommandEmpty>No pages match that search.</CommandEmpty>
            {groupEntries(entries).map(({ group, entries: items }, index) => (
              <Fragment key={group}>
                {index > 0 ? <CommandSeparator /> : null}
                <CommandGroup heading={group}>
                  {items.map((entry) => (
                    <CommandItem
                      disabled={entry.disabled}
                      key={`${group}-${entry.id}`}
                      onSelect={() => handleSelect(entry)}
                      value={`${entry.group} ${entry.label}`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {entry.icon}
                        <span className="truncate">{entry.label}</span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Fragment>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
