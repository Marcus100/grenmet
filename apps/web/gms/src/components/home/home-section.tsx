import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * A full-bleed band on the home page: kicker, condensed uppercase heading,
 * optional onward link, then content in the page column. Bands alternate
 * white and `gm-surface` so sections separate without borders.
 */
export function HomeSection({
  children,
  kicker,
  link,
  title,
  tone = "page",
}: {
  children: React.ReactNode;
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
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 font-bold text-gm-sky-ink text-label uppercase leading-label tracking-widest">
              {kicker}
            </p>
            <h2 className="text-balance font-bold font-gm-display text-gm-display text-gm-heading uppercase tracking-wide">
              {title}
            </h2>
          </div>
          {link && (
            <Link
              className="ml-auto flex items-center gap-1 font-semibold text-body text-gm-blue-ink leading-body hover:underline"
              href={link.href}
            >
              {link.label}
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
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
