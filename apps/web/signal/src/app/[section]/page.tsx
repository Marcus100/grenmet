import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryListItem } from "@/components/story-list-item";
import { SubscribeBand } from "@/components/subscribe-band";
import { getArticlesBySection } from "@/lib/content";
import { getSection, SECTIONS } from "@/lib/nav";

interface Props {
  params: Promise<{ section: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section: section.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  const meta = getSection(section);
  if (!meta) return {};
  return { title: meta.label, description: meta.description };
}

export default async function SectionPage({ params }: Props) {
  const { section } = await params;
  const meta = getSection(section);
  if (!meta) notFound();

  const articles = getArticlesBySection(section);

  return (
    <>
      <div className="mx-auto w-full max-w-2xl px-4 pt-10 pb-2">
        <h1 className="font-bold font-serif text-3xl tracking-tight">
          {meta.label}
        </h1>
        <p className="mt-2 text-signal-muted">{meta.description}</p>
      </div>

      <div className="mx-auto w-full max-w-2xl px-4 pb-8">
        {articles.length > 0 ? (
          <div className="mt-4 flex flex-col border-signal-ink border-t-2">
            {articles.map((article) => (
              <StoryListItem
                author={article.author}
                eyebrow={meta.label}
                href={`/${article.section}/${article.slug}`}
                key={article.slug}
                publishedAt={article.publishedAt}
                title={article.title}
              />
            ))}
          </div>
        ) : (
          <p className="mt-6 text-signal-muted">
            No stories yet — check back soon.
          </p>
        )}
      </div>

      <SubscribeBand />
    </>
  );
}
