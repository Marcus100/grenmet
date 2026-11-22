import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@barrelsgd/ui/components/ui/pagination";

/**
 * Pager for the console's paginated lists. Pages are links (the page reloads
 * from the server with the same filters); the first and last page show the
 * same controls disabled, so the position of the buttons never jumps.
 */
export function ConsolePager({
  count,
  label = "Pages",
  lastPage,
  nextHref,
  page,
  previousHref,
}: {
  count: number;
  label?: string;
  lastPage: number;
  nextHref: string | undefined;
  page: number;
  previousHref: string | undefined;
}) {
  const current = Math.min(page, lastPage);
  return (
    <Pagination aria-label={label} className="flex-wrap justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        {count} total, page {current} of {lastPage}
      </p>
      <PaginationContent>
        <PaginationItem>
          {previousHref ? (
            <PaginationPrevious href={previousHref} />
          ) : (
            <DisabledStep label="Go to previous page">Previous</DisabledStep>
          )}
        </PaginationItem>
        <PaginationItem>
          {nextHref ? (
            <PaginationNext href={nextHref} />
          ) : (
            <DisabledStep label="Go to next page">Next</DisabledStep>
          )}
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function DisabledStep({
  children,
  label,
}: {
  children: string;
  label: string;
}) {
  return (
    <Button
      aria-label={label}
      className="pointer-events-none opacity-50"
      disabled
      size="default"
      variant="ghost"
    >
      <span className="hidden sm:block">{children}</span>
    </Button>
  );
}
