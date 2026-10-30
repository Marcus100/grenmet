import { linkablePage } from "@barrelsgd/gms/linkable-pages";
import { ArrowRightIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * A page of this site attached to a post: its menu title and one line about
 * it, taken from the site's own navigation so they never go stale. A page that
 * is not in the menu (a dated forecast day, say) shows the title the editor
 * gave it.
 */
export function LinkedPage({
  className,
  fallbackTitle,
  path,
}: {
  className?: string;
  fallbackTitle?: string;
  path: string;
}) {
  const page = linkablePage(path);
  return (
    <Link
      className={cn(
        "rounded-gm-card border-gm-border bg-gm-surface hover:border-gm-blue-ink flex flex-col gap-1 border p-4",
        className
      )}
      href={path as Route}
    >
      {page && (
        <span className="text-gm-sky-ink text-label leading-label font-bold tracking-wider uppercase">
          {page.section}
        </span>
      )}
      <span className="text-body-base text-gm-heading leading-body-base flex items-center gap-1 font-bold">
        {page?.title ?? fallbackTitle ?? path}
        <ArrowRightIcon aria-hidden="true" className="size-4" />
      </span>
      {page && (
        <span className="text-body-sm text-gm-text-secondary leading-body-sm">
          {page.description}
        </span>
      )}
    </Link>
  );
}
