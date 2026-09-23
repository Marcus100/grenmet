"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/Button";
import {
  getNavigationSection,
  hurricaneNavigation,
  staffNavigation,
} from "@/components/Navigation";

function PageLink({
  label,
  page,
  previous = false,
}: {
  label: string;
  page: { href: string; title: string };
  previous?: boolean;
}) {
  return (
    <>
      <Button
        aria-label={`${label}: ${page.title}`}
        arrow={previous ? "left" : "right"}
        href={page.href}
        variant="secondary"
      >
        {label}
      </Button>
      <Link
        aria-hidden="true"
        className="font-semibold text-base text-zinc-900 transition hover:text-zinc-600 dark:text-white dark:hover:text-zinc-300"
        href={page.href}
        tabIndex={-1}
      >
        {page.title}
      </Link>
    </>
  );
}

function PageNavigation() {
  const pathname = usePathname();
  const section = getNavigationSection(pathname);
  const groups =
    section === "hurricane" ? hurricaneNavigation : staffNavigation;
  const allPages = groups
    .flatMap((group) => group.links)
    .filter((page) => page.href !== "/");
  const currentPageIndex = allPages.findIndex((page) => page.href === pathname);

  if (currentPageIndex === -1 || pathname === "/") {
    return null;
  }

  const previousPage = allPages[currentPageIndex - 1];
  const nextPage = allPages[currentPageIndex + 1];

  if (!(previousPage || nextPage)) {
    return null;
  }

  return (
    <div className="flex">
      {previousPage && (
        <div className="flex flex-col items-start gap-3">
          <PageLink label="Previous" page={previousPage} previous />
        </div>
      )}
      {nextPage && (
        <div className="ml-auto flex flex-col items-end gap-3">
          <PageLink label="Next" page={nextPage} />
        </div>
      )}
    </div>
  );
}

function SmallPrint() {
  return (
    <div className="flex flex-col items-center justify-between gap-5 border-zinc-900/5 border-t pt-8 sm:flex-row dark:border-white/5">
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        &copy; Copyright {new Date().getFullYear()}. All rights reserved.
      </p>
      <div className="flex gap-4">
        <Link className="text-sm underline" href="/errors">
          Help
        </Link>
        <Link className="text-sm underline" href="/webhooks">
          Data feeds
        </Link>
        <Link className="text-sm underline" href="/quickstart">
          Staff guide
        </Link>
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-2xl space-y-10 pb-16 lg:max-w-5xl">
      <PageNavigation />
      <SmallPrint />
    </footer>
  );
}
