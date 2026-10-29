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
        "flex flex-col gap-1 rounded-gm-card border border-gm-border bg-gm-surface p-4 hover:border-gm-blue-ink",
        className
      )}
      href={path as Route}
    >
      {page && (
        <span className="font-bold text-gm-sky-ink text-label uppercase leading-label tracking-wider">
          {page.section}
        </span>
      )}
      <span className="flex items-center gap-1 font-bold text-body-base text-gm-heading leading-body-base">
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
