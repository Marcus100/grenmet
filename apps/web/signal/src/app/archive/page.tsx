import Link from "next/link";
import { PageIntro, StoryCard } from "@/components/editorial";
import { getBriefs, getPublishedArticles } from "@/lib/content";
import { formatLongDate } from "@/lib/format";
export const metadata = { title: "Archive" };
export default function ArchivePage() {
  const articles = getPublishedArticles();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <PageIntro eyebrow="The Signal archive" title="Worth another read.">
        <p>
          Browse previous editions and stories, with their original publication
          dates. This preview contains sample material from June 2026.
        </p>
      </PageIntro>
      <section className="border-signal-rule border-t py-8">
        <h2 className="font-serif text-3xl">Past editions</h2>
        {getBriefs().map((brief) => (
          <p className="mt-4" key={brief.date}>
            <Link
              className="inline-flex min-h-11 flex-wrap gap-x-3 text-lg text-signal-green underline underline-offset-4"
              href={`/today/${brief.date}`}
            >
              <time dateTime={brief.date}>{formatLongDate(brief.date)}</time>
              <span>{brief.title}</span>
            </Link>
          </p>
        ))}
      </section>
      <section className="border-signal-ink border-t-2 pt-6">
        <h2 className="mb-8 font-serif text-3xl">All stories</h2>
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <StoryCard article={article} headingLevel={3} key={article.slug} />
          ))}
        </div>
        {articles.length ? null : (
          <p className="text-lg">There are no stories in the archive yet.</p>
        )}
      </section>
    </div>
  );
}
