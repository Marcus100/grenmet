import { ArrowRightIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * A full-bleed band on the home page: kicker, condensed uppercase heading,
 * optional onward link on the title's line, then content in the page column. Bands alternate
 * white and `gm-surface` so sections separate without borders.
 */
export function HomeSection({
  children,
  intro,
  kicker,
  link,
  title,
  tone = "page",
}: {
  children: React.ReactNode;
  intro?: string;
  kicker: string;
  link?: { href: string; label: string };
  title: string;
  tone?: "page" | "surface";
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "py-8 lg:py-12",
        tone === "surface" ? "bg-gm-surface" : "bg-background"
      )}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 xl:px-8">
        <div className="mb-5">
          <p className="text-gm-sky-ink text-label leading-label mb-1 font-bold tracking-widest uppercase">
            {kicker}
          </p>
          {/* The onward link sits on the title's line, even on phones. */}
          {/* Phones stack the link under the heading so the heading gets the full
              width ("Questions about the weather" took three lines beside it). */}
          <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            <h2 className="font-gm-display text-gm-display text-gm-heading min-w-0 font-bold tracking-wide text-balance uppercase">
              {title}
            </h2>
            {link && (
              <Link
                className="text-body-sm text-gm-blue-ink leading-body-sm sm:text-body sm:leading-body mb-1 flex shrink-0 items-center gap-1 font-semibold hover:underline"
                href={link.href as Route}
              >
                {link.label}
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Link>
            )}
          </div>
          {intro && (
            <p className="text-body-base text-gm-text-secondary leading-body-base mt-2 max-w-prose">
              {intro}
            </p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

/** The rounded, bordered card every home section is built from. */
export const HOME_CARD =
  "rounded-gm-card border border-gm-border bg-background p-4 lg:p-5";
