import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Search } from "lucide-react";
import Link from "next/link";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PARISH_LABELS,
  PARISHES,
} from "@/domain/labels";
import type { EventFilters } from "@/domain/types";

const WHEN_OPTIONS = [
  ["", "Any time"],
  ["tonight", "Tonight"],
  ["weekend", "This weekend"],
  ["week", "Next 7 days"],
  ["month", "Next 30 days"],
] as const;

/**
 * Plain GET form: filters live in the URL so results are shareable and work
 * without JavaScript.
 */
export function FilterBar({
  filters,
  view,
}: {
  filters: EventFilters;
  view: "list" | "month";
}) {
  return (
    <search>
      <form
        action="/events"
        className="grid gap-3 rounded-2xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)_auto]"
      >
        <input name="view" type="hidden" value={view} />
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label className="sr-only" htmlFor="filter-q">
            Search
          </label>
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-body outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
            defaultValue={filters.query ?? ""}
            id="filter-q"
            name="q"
            placeholder="Search"
            type="search"
          />
        </div>
        <Select defaultValue={filters.when ?? ""} label="When" name="when">
          {WHEN_OPTIONS.map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </Select>
        <Select
          defaultValue={filters.category ?? ""}
          label="Category"
          name="category"
        >
          <NativeSelectOption value="">All categories</NativeSelectOption>
          {CATEGORIES.map((category) => (
            <NativeSelectOption key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </NativeSelectOption>
          ))}
        </Select>
        <Select
          defaultValue={filters.parish ?? ""}
          label="Parish"
          name="parish"
        >
          <NativeSelectOption value="">All parishes</NativeSelectOption>
          {PARISHES.map((parish) => (
            <NativeSelectOption key={parish} value={parish}>
              {PARISH_LABELS[parish]}
            </NativeSelectOption>
          ))}
        </Select>
        <Select defaultValue={filters.price ?? ""} label="Price" name="price">
          <NativeSelectOption value="">Free & paid</NativeSelectOption>
          <NativeSelectOption value="free">Free</NativeSelectOption>
          <NativeSelectOption value="paid">Paid</NativeSelectOption>
        </Select>
        <div className="flex gap-2">
          <button
            className={cn(buttonVariants({ size: "lg" }), "h-10 flex-1")}
            type="submit"
          >
            Apply
          </button>
          <Link
            className={cn(
              buttonVariants({ size: "lg", variant: "ghost" }),
              "h-10"
            )}
            href={`/events?view=${view}`}
          >
            Clear
          </Link>
        </div>
      </form>
    </search>
  );
}

function Select({
  children,
  defaultValue,
  label,
  name,
}: {
  children: React.ReactNode;
  defaultValue: string;
  label: string;
  name: string;
}) {
  return (
    <div>
      <label className="sr-only" htmlFor={`filter-${name}`}>
        {label}
      </label>
      <NativeSelect
        className="w-full [&_select]:h-10 [&_select]:w-full"
        defaultValue={defaultValue}
        id={`filter-${name}`}
        name={name}
      >
        {children}
      </NativeSelect>
    </div>
  );
}
