import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleMeta } from "@/components/article-meta";
import { ArchiveInvitation, DemoNote } from "@/components/editorial";
import { Eyebrow } from "@/components/eyebrow";
import { MdxContent } from "@/components/mdx-content";
import { StoryImage } from "@/components/story-image";
import { getArticle, getPublishedArticles } from "@/lib/content";
import { getSection } from "@/lib/nav";

interface Props {
  params: Promise<{ section: string; slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getPublishedArticles().map((article) => ({
    section: article.section,
    slug: article.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section, slug } = await params;
  const article = getArticle(section, slug);
  if (!article) return {};
  return { title: article.title, description: article.dek };
}

export default async function ArticlePage({ params }: Props) {
  const { section, slug } = await params;
  const article = getArticle(section, slug);
  if (!article) notFound();

  const meta = getSection(section);
  const sectionLabel = meta?.label ?? section;

  return (
    <>
      <article className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link
          className="text-signal-muted hover:text-signal-green inline-flex items-center gap-1.5 text-sm tracking-wider uppercase"
          href={`/${section}`}
        >
          <ArrowLeft className="size-3.5" /> {sectionLabel}
        </Link>

        <header className="mt-4 flex flex-col gap-3">
          <Eyebrow>{sectionLabel}</Eyebrow>
          <h1 className="font-serif text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
            {article.title}
          </h1>
          <p className="text-lg leading-relaxed">{article.dek}</p>
          <ArticleMeta
            author={article.author}
            publishedAt={article.publishedAt}
          />
        </header>

        <DemoNote reviewStatus={article.reviewStatus} />
        <StoryImage article={article} className="mt-6" priority />

        <div className="prose prose-lg prose-neutral prose-headings:font-serif prose-a:text-signal-green mt-8 max-w-none">
          <MdxContent code={article.body} />
        </div>

        {article.sources.length > 0 ? (
          <aside className="border-signal-rule bg-background mt-10 rounded-lg border p-5">
            <h2 className="text-signal-green font-serif text-sm font-semibold tracking-wider uppercase">
              Sources
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {article.sources.map((source) => (
                <li key={source.url}>
                  <a
                    className="text-signal-green hover:text-signal-green-dark underline underline-offset-2"
                    href={source.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {source.label}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </article>

      <ArchiveInvitation />
    </>
  );
}
