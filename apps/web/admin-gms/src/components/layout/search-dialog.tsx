"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@grenmet/ui/components/ui/command";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { type NavMainItem, sidebarItems } from "@/navigation/sidebar-items";

interface SearchItem {
  disabled?: boolean;
  group: string;
  icon?: NavMainItem["icon"];
  id: string;
  label: string;
  newTab?: boolean;
  url: string;
}

const sidebarGroupLabels = new Set(
  sidebarItems.flatMap((group) => (group.label ? [group.label] : []))
);

function getSubItemGroup(groupLabel: string | undefined, itemTitle: string) {
  return sidebarGroupLabels.has(itemTitle)
    ? (groupLabel ?? "Other")
    : itemTitle;
}

const searchItems: SearchItem[] = sidebarItems.flatMap((group) =>
  group.items.flatMap((item) => {
    if (item.subItems) {
      return item.subItems.map((sub) => ({
        id: sub.id,
        group: getSubItemGroup(group.label, item.title),
        label: sub.title,
        url: sub.url,
        icon: item.icon,
        disabled: sub.disabled,
        newTab: sub.newTab,
      }));
    }
    return [
      {
        id: item.id,
        group: group.label ?? "Other",
        label: item.title,
        url: item.url,
        icon: item.icon,
        disabled: item.disabled,
        newTab: item.newTab,
      },
    ];
  })
);

function getAvailableItems(items: SearchItem[]) {
  return items.filter(
    (item) => !(item.disabled || item.url.includes("coming-soon"))
  );
}

const recommendations = getAvailableItems(searchItems);

function groupBy(items: SearchItem[]) {
  const groups = [...new Set(items.map((item) => item.group))];
  return groups.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  }));
}

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setQuery("");
    }
  };

  const handleSelect = (item: SearchItem) => {
    if (item.disabled) {
      return;
    }
    handleOpenChange(false);
    if (item.newTab) {
      window.open(item.url, "_blank", "noopener,noreferrer");
    } else {
      router.push(item.url);
    }
  };

  const renderGroups = (items: SearchItem[]) =>
    groupBy(items).map(({ group, items: groupItems }, index) => (
      <Fragment key={group}>
        {index > 0 && <CommandSeparator />}
        <CommandGroup heading={group}>
          {groupItems.map((item) => (
            <CommandItem
              disabled={item.disabled}
              key={`${group}-${item.id}`}
              onSelect={() => handleSelect(item)}
              value={`${item.group} ${item.label}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.icon && <item.icon />}
                <span className="truncate">{item.label}</span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </Fragment>
    ));

  return (
    <>
      <Button
        className="px-0! font-normal text-muted-foreground hover:no-underline"
        onClick={() => handleOpenChange(true)}
        variant="link"
      >
        <Search data-icon="inline-start" />
        Search
        <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px]">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog onOpenChange={handleOpenChange} open={open}>
        <Command>
          <CommandInput
            onValueChange={setQuery}
            placeholder="Search admin…"
            value={query}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {query ? renderGroups(searchItems) : renderGroups(recommendations)}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
