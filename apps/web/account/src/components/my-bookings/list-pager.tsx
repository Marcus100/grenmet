import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";

interface ListPagerProps {
  /** The page on screen, 1-indexed. */
  page: number;
  pageCount: number;
  /** Query parameter that carries the page number on /bookings. */
  pageParam: string;
}

/** Previous and next links; page 1 has no parameter so its URL stays clean. */
function pageHref(pageParam: string, page: number) {
  return {
    pathname: "/bookings" as const,
    query: page === 1 ? {} : { [pageParam]: String(page) },
  };
}

export function ListPager({ page, pageCount, pageParam }: ListPagerProps) {
  if (pageCount <= 1) return null;
  const previous = page > 1 ? page - 1 : null;
  const next = page < pageCount ? page + 1 : null;

  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-4">
      {previous === null ? (
        <span aria-hidden="true" />
      ) : (
        <Link
          className={cn(buttonVariants({ variant: "outline" }))}
          href={pageHref(pageParam, previous)}
        >
          Previous
        </Link>
      )}
      <p className="text-muted-foreground text-sm">
        Page {page} of {pageCount}
      </p>
      {next === null ? (
        <span aria-hidden="true" />
      ) : (
        <Link
          className={cn(buttonVariants({ variant: "outline" }))}
          href={pageHref(pageParam, next)}
        >
          Next
        </Link>
      )}
    </nav>
  );
}
