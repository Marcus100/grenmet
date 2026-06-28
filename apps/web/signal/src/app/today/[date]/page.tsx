import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Eyebrow } from "@/components/eyebrow";
import { MdxContent } from "@/components/mdx-content";
import { SectionBlock } from "@/components/section-block";
import { StoryListItem } from "@/components/story-list-item";
import { SubscribeBand } from "@/components/subscribe-band";
import { getBrief, getBriefs, getPublishedArticles } from "@/lib/content";
import { formatLongDate } from "@/lib/format";
import { getSection } from "@/lib/nav";

interface Props {
  params: Promise<{ date: string }>;
}

export function generateStaticParams() {
  return getBriefs().map((brief) => ({ date: brief.date }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  const brief = getBrief(date);
  if (!brief) return {};
  return { title: brief.title, description: brief.dek };
}

export default async function BriefPage({ params }: Props) {
  const { date } = await params;
  const brief = getBrief(date);
  if (!brief) notFound();

  const more = getPublishedArticles().slice(0, 4);

  return (
    <>
      <article className="mx-auto w-full max-w-2xl px-4 py-8">
        <header className="flex flex-col gap-3 border-signal-ink border-b-2 pb-6">
          <Eyebrow>Morning Signal</Eyebrow>
          <h1 className="font-bold font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
            {brief.title}
          </h1>
          <p className="text-signal-muted">{brief.dek}</p>
          <p className="text-[0.7rem] text-signal-muted uppercase tracking-wide">
            Presented by {brief.presenter} · {formatLongDate(brief.date)}
          </p>
        </header>

        <div className="prose prose-neutral mt-8 prose-h2:mb-2 max-w-none prose-h2:border-signal-gold prose-h2:border-b-2 prose-h2:pb-1 prose-h2:font-semibold prose-headings:font-serif prose-a:text-signal-green prose-h2:text-base prose-h2:text-signal-green prose-h2:uppercase prose-h2:tracking-wider">
          <MdxContent code={brief.body} />
        </div>
      </article>

      <SubscribeBand />

      {more.length > 0 ? (
        <SectionBlock title="Read more">
          <div className="flex flex-col">
            {more.map((article) => (
              <StoryListItem
                author={article.author}
                eyebrow={getSection(article.section)?.label ?? article.section}
                href={`/${article.section}/${article.slug}`}
                key={`${article.section}/${article.slug}`}
                publishedAt={article.publishedAt}
                title={article.title}
              />
            ))}
          </div>
        </SectionBlock>
      ) : null}
    </>
  );
}
