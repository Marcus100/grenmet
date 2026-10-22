import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";

type Params = Record<string, string | undefined>;

export function listHref(basePath: string, params: Params): Route {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }
  const text = query.toString();
  return (text ? `${basePath}?${text}` : basePath) as Route;
}

/** A row of filter links (plain navigation, so it works without scripts). */
export function FilterLinks({
  basePath,
  current,
  label,
  options,
  param,
  params,
}: {
  basePath: string;
  current: string | undefined;
  label: string;
  options: readonly { label: string; value: string | undefined }[];
  param: string;
  /** The other active filters, kept when this one changes. */
  params: Params;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === current;
        return (
          <Link
            aria-current={active ? "true" : undefined}
            className={cn(
              buttonVariants({ variant: active ? "default" : "outline" }),
              "min-h-11"
            )}
            href={listHref(basePath, { ...params, [param]: option.value })}
            key={option.label}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Previous and next links with the position, always shown. */
export function Pager({
  basePath,
  count,
  page,
  params,
  totalPages,
}: {
  basePath: string;
  count: number;
  page: number;
  params: Params;
  totalPages: number;
}) {
  const pages = Math.max(totalPages, 1);
  const link = cn(buttonVariants({ variant: "outline" }), "min-h-11");
  const off = cn(link, "pointer-events-none opacity-50");
  return (
    <nav
      aria-label="Pages"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-body text-muted-foreground">
        Page {page} of {pages} · {count} in total
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            className={link}
            href={listHref(basePath, { ...params, page: String(page - 1) })}
            rel="prev"
          >
            Previous
          </Link>
        ) : (
          <span aria-disabled="true" className={off}>
            Previous
          </span>
        )}
        {page < pages ? (
          <Link
            className={link}
            href={listHref(basePath, { ...params, page: String(page + 1) })}
            rel="next"
          >
            Next
          </Link>
        ) : (
          <span aria-disabled="true" className={off}>
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
