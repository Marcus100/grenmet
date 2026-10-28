import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";

/** Previous and next links for the roster; nothing when there is one page. */
export function TeamPager({
  count,
  page,
  totalPages,
}: {
  count: number;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }
  const link = cn(buttonVariants({ variant: "outline" }), "min-h-11");
  return (
    <nav
      aria-label="Team pages"
      className="flex items-center justify-between gap-3"
    >
      {page > 1 ? (
        <Link className={link} href={`/dash/team?page=${page - 1}`}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <p className="text-caption text-muted-foreground">
        Page {page} of {totalPages} ({count} members)
      </p>
      {page < totalPages ? (
        <Link className={link} href={`/dash/team?page=${page + 1}`}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
