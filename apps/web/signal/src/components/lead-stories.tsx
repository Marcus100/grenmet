import { cn } from "@barrelsgd/ui/lib/utils";
import { BadgeCheck, BriefcaseBusiness, MapPin, Newspaper } from "lucide-react";
import Link from "next/link";
import { StoryImage } from "@/components/story-image";
import type { Article } from "@/lib/content";
import { formatLongDate } from "@/lib/format";
import { getSection, SERIES } from "@/lib/nav";

const SERIES_ICONS = [Newspaper, MapPin, BadgeCheck, BriefcaseBusiness];

type LeadArticle = Pick<
  Article,
  "title" | "dek" | "section" | "slug" | "author" | "publishedAt"
>;

function FeaturedStory({
  article,
  lead = false,
}: {
  article: LeadArticle;
  lead?: boolean;
}) {
  return (
    <article
      className={cn(
        "min-w-0",
        lead &&
          "overflow-hidden rounded-lg border border-signal-rule bg-secondary"
      )}
    >
      {lead ? (
        <StoryImage
          article={article}
          className="mb-0 [&_figcaption]:px-6 [&_figcaption]:pt-2"
          priority
        />
      ) : null}
      <div className={lead ? "p-6 sm:p-8" : undefined}>
        <p className="mb-3 font-semibold text-signal-green text-sm uppercase tracking-wide">
          {getSection(article.section)?.label ?? article.section}
        </p>
        <h3
          className={cn(
            "font-bold leading-tight tracking-tight",
            lead
              ? "font-serif text-3xl sm:text-4xl"
              : "font-sans text-xl lg:text-2xl"
          )}
        >
          <Link
            className="hover:text-signal-green hover:underline"
            href={`/${article.section}/${article.slug}`}
          >
            {article.title}
          </Link>
        </h3>
        {lead ? (
          <p className="mt-4 text-lg leading-relaxed">{article.dek}</p>
        ) : null}
      </div>
    </article>
  );
}

export function LeadStories({ articles }: { articles: LeadArticle[] }) {
  const [lead, ...supporting] = articles;
  return (
    <section
      aria-labelledby="stories-title"
      className="border-signal-rule border-b py-4 pb-10"
    >
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <h2
          className="font-semibold font-serif text-heading-base"
          id="stories-title"
        >
          The stories to know
        </h2>
        {lead ? (
          <time
            className="text-signal-muted text-sm"
            dateTime={lead.publishedAt}
          >
            {formatLongDate(lead.publishedAt)}
          </time>
        ) : null}
      </header>
      <div
        className={cn(
          "grid items-start gap-8 lg:gap-10",
          supporting.length > 0 && "lg:grid-cols-2"
        )}
      >
        {lead ? (
          <FeaturedStory article={lead} lead />
        ) : (
          <p className="text-lg">Our first stories are still to come.</p>
        )}
        {supporting.length > 0 ? (
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-4 border-signal-rule border-b pb-5">
              <h2 className="font-bold font-sans text-3xl tracking-tight">
                The Latest
              </h2>
              <Link
                className="inline-flex min-h-11 items-center font-semibold text-signal-green text-sm uppercase tracking-wide hover:underline"
                href="/archive"
              >
                All stories →
              </Link>
            </div>
            <div className="divide-y divide-signal-rule">
              {supporting.slice(0, 5).map((article) => (
                <div
                  className="py-6"
                  key={`${article.section}/${article.slug}`}
                >
                  <FeaturedStory article={article} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <nav
        aria-label="More from Signal"
        className="mt-8 border-signal-ink border-t pt-6"
      >
        <p className="mb-4 font-semibold text-signal-muted text-sm">
          More from Signal
        </p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SERIES.map((series, index) => {
            const Icon = SERIES_ICONS[index] ?? Newspaper;
            return (
              <div key={series.label}>
                <Link
                  className="inline-flex min-h-11 items-center gap-2 font-semibold font-serif text-xl hover:underline"
                  href={series.href}
                >
                  <Icon
                    aria-hidden="true"
                    className="size-5 shrink-0 text-signal-green"
                    strokeWidth={1.5}
                  />
                  {series.label}
                  <span aria-hidden="true" className="text-signal-green">
                    ↗
                  </span>
                </Link>
                <p className="mt-1 text-sm leading-relaxed">
                  {series.description}
                </p>
              </div>
            );
          })}
        </div>
      </nav>
    </section>
  );
}
