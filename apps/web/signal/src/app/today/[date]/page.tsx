import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { ArchiveInvitation, DemoNote } from "@/components/editorial";
import { Eyebrow } from "@/components/eyebrow";
import { MdxContent } from "@/components/mdx-content";
import { SectionBlock } from "@/components/section-block";
import { StoryListItem } from "@/components/story-list-item";
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
        <header className="border-signal-ink flex flex-col gap-3 border-b-2 pb-6">
          <Eyebrow>Daily Signal</Eyebrow>
          <h1 className="font-serif text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
            {brief.title}
          </h1>
          <p className="text-lg leading-relaxed">{brief.dek}</p>
          <p className="text-signal-muted text-sm tracking-wide uppercase">
            {brief.presenter} · {formatLongDate(brief.date)}
          </p>
        </header>

        <DemoNote reviewStatus={brief.reviewStatus} />
        <div className="prose prose-lg prose-neutral prose-h2:mb-2 prose-h2:border-signal-gold prose-h2:border-b-2 prose-h2:pb-1 prose-h2:font-semibold prose-headings:font-serif prose-a:text-signal-green prose-h2:text-2xl prose-h2:text-signal-green mt-8 max-w-none">
          <MdxContent code={brief.body} />
        </div>
      </article>

      <ArchiveInvitation />

      {more.length > 0 ? (
        <SectionBlock title="Read more">
          <div className="flex flex-col">
            {more.map((article) => (
              <StoryListItem
                author={article.author}
                eyebrow={getSection(article.section)?.label ?? article.section}
                href={`/${article.section}/${article.slug}` as Route}
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
