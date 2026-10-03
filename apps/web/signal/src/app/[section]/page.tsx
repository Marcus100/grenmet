import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArchiveInvitation,
  EmptyState,
  PageIntro,
  StoryCard,
} from "@/components/editorial";
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
  const meta = getSection((await params).section);
  return { title: meta?.label, description: meta?.description };
}
export default async function SectionPage({ params }: Props) {
  const { section } = await params;
  const meta = getSection(section);
  if (!meta) notFound();
  const articles = getArticlesBySection(section);
  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
        <PageIntro eyebrow="Explore a topic" title={meta.label}>
          <p>{meta.description}</p>
        </PageIntro>
        {articles.length ? (
          <div className="grid gap-10 border-signal-rule border-t pt-8 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <StoryCard article={article} key={article.slug} />
            ))}
          </div>
        ) : (
          <EmptyState title="No stories in this topic yet.">
            This topic is part of Signal’s planned coverage. Explore the
            available sample stories while we develop the publication.
          </EmptyState>
        )}
      </div>
      <ArchiveInvitation />
    </>
  );
}
