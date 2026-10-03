import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState, PageIntro, StoryCard } from "@/components/editorial";
import { getPublishedArticles } from "@/lib/content";
import { COLLECTIONS, selectStories } from "@/lib/discovery";

interface Props {
  params: Promise<{ slug: string }>;
}
export function generateStaticParams() {
  return COLLECTIONS.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: COLLECTIONS.find((item) => item.slug === slug)?.title };
}
export default async function CollectionPage({ params }: Props) {
  const { slug } = await params;
  const collection = COLLECTIONS.find((item) => item.slug === slug);
  if (!collection) notFound();
  const articles = selectStories(getPublishedArticles(), collection.paths);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <PageIntro eyebrow={collection.kicker} title={collection.title}>
        <p>{collection.description}</p>
      </PageIntro>
      {articles.length ? (
        <div className="grid gap-10 border-signal-rule border-t pt-8 md:grid-cols-2">
          {articles.map((article) => (
            <StoryCard article={article} key={article.slug} wideImage />
          ))}
        </div>
      ) : (
        <EmptyState title="This collection has no stories yet.">
          You can explore our other topics while this reading list takes shape.
        </EmptyState>
      )}
    </div>
  );
}
