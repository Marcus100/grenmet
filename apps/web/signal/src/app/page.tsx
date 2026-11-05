import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { ArchiveInvitation, StoryCard } from "@/components/editorial";
import { Eyebrow } from "@/components/eyebrow";
import { LeadStories } from "@/components/lead-stories";
import { getCurrentArticles, getLatestBrief } from "@/lib/content";
import { COLLECTIONS, HOME_LEAD_PATHS, selectStories } from "@/lib/discovery";
import { formatLongDate } from "@/lib/format";
import { SECTIONS } from "@/lib/nav";

export default function HomePage() {
  const brief = getLatestBrief();
  const articles = getCurrentArticles();
  const collection = COLLECTIONS[0];
  const collectionStories = collection
    ? selectStories(articles, collection.paths)
    : [];
  const featuredPaths = new Set([
    ...HOME_LEAD_PATHS,
    ...(collection?.paths.slice(0, 2) ?? []),
  ]);
  return (
    <>
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        {brief ? (
          <section
            aria-labelledby="briefing-title"
            className="border-signal-gold bg-signal-green text-primary-foreground my-8 grid gap-6 border-t-4 p-6 sm:p-8 lg:grid-cols-3"
          >
            <div>
              <p className="text-sm font-semibold tracking-wider uppercase">
                Your daily briefing
              </p>
              <h1
                className="mt-3 font-serif text-4xl leading-tight font-semibold"
                id="briefing-title"
              >
                Daily Signal
              </h1>
              <p className="mt-4 text-base">
                <time dateTime={brief.date}>{formatLongDate(brief.date)}</time>
              </p>
            </div>
            <div className="lg:col-span-2">
              <h2 className="font-serif text-2xl leading-snug font-semibold sm:text-3xl">
                <Link className="hover:underline" href={`/today/${brief.date}`}>
                  {brief.title}
                </Link>
              </h2>
              <p className="mt-3 max-w-2xl text-lg leading-relaxed">
                {brief.dek}
              </p>
              <Link
                className="border-signal-gold mt-5 inline-flex min-h-11 items-center border-b-2 font-semibold"
                href={`/today/${brief.date}`}
              >
                Read the briefing →
              </Link>
            </div>
          </section>
        ) : (
          <h1 className="py-8 font-serif text-4xl">The latest from Signal</h1>
        )}
        <LeadStories articles={selectStories(articles, HOME_LEAD_PATHS)} />
        {collection && collectionStories.length > 0 ? (
          <section className="border-signal-rule border-b py-10">
            <header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div className="max-w-2xl">
                <Eyebrow>{collection.kicker}</Eyebrow>
                <h2 className="mt-4 font-serif text-3xl">
                  <Link
                    className="hover:underline"
                    href={`/collections/${collection.slug}`}
                  >
                    {collection.title}
                  </Link>
                </h2>
                <p className="mt-3 text-lg leading-relaxed">
                  {collection.description}
                </p>
              </div>
              <Link
                className="text-signal-green inline-flex min-h-11 items-center underline underline-offset-4"
                href={`/collections/${collection.slug}`}
              >
                Explore the collection →
              </Link>
            </header>
            <div className="grid gap-8 md:grid-cols-2">
              {collectionStories.slice(0, 2).map((article) => (
                <StoryCard article={article} key={article.slug} wideImage />
              ))}
            </div>
          </section>
        ) : null}
        <div className="grid gap-x-10 md:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => {
            const stories = articles.filter(
              (article) =>
                article.section === section.slug &&
                !featuredPaths.has(`${article.section}/${article.slug}`)
            );
            const isWorld = section.slug === "grenada-world";
            return stories.length ? (
              <section
                className={cn(
                  "min-w-0 py-10",
                  isWorld && "md:col-span-2 lg:col-span-3"
                )}
                key={section.slug}
              >
                <h2 className="border-signal-ink border-t-2 pt-4 font-serif text-2xl font-semibold">
                  <Link
                    className="hover:text-signal-green"
                    href={`/${section.slug}`}
                  >
                    {section.label} →
                  </Link>
                </h2>
                <div
                  className={cn(
                    "mt-6",
                    isWorld
                      ? "grid gap-8 md:grid-cols-2 lg:grid-cols-3"
                      : "space-y-8"
                  )}
                >
                  {stories.slice(0, isWorld ? 3 : 2).map((article, index) =>
                    index === 0 || isWorld ? (
                      <StoryCard
                        article={article}
                        headingLevel={3}
                        key={article.slug}
                        wideImage
                      />
                    ) : (
                      <h3
                        className="border-signal-rule border-t pt-5 font-serif text-xl leading-snug font-semibold"
                        key={article.slug}
                      >
                        <Link
                          className="hover:text-signal-green hover:underline"
                          href={`/${article.section}/${article.slug}`}
                        >
                          {article.title}
                        </Link>
                      </h3>
                    )
                  )}
                </div>
              </section>
            ) : null;
          })}
        </div>
      </div>
      <ArchiveInvitation />
    </>
  );
}
