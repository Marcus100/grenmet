import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleMeta } from "@/components/article-meta";
import { Eyebrow } from "@/components/eyebrow";
import { MdxContent } from "@/components/mdx-content";
import { SubscribeBand } from "@/components/subscribe-band";
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
          className="inline-flex items-center gap-1.5 text-[0.7rem] text-signal-muted uppercase tracking-wider hover:text-signal-green"
          href={`/${section}`}
        >
          <ArrowLeft className="size-3.5" /> {sectionLabel}
        </Link>

        <header className="mt-4 flex flex-col gap-3">
          <Eyebrow>{sectionLabel}</Eyebrow>
          <h1 className="font-bold font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
            {article.title}
          </h1>
          <p className="text-lg text-signal-muted">{article.dek}</p>
          <ArticleMeta
            author={article.author}
            publishedAt={article.publishedAt}
          />
        </header>

        <div className="relative mt-6 aspect-[16/10] w-full overflow-hidden rounded-lg bg-signal-green/10">
          <Image
            alt={article.heroAlt}
            className="object-cover"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 640px"
            src={article.heroImage}
          />
        </div>

        <div className="prose prose-neutral mt-8 max-w-none prose-headings:font-serif prose-a:text-signal-green">
          <MdxContent code={article.body} />
        </div>

        {article.sources.length > 0 ? (
          <aside className="mt-10 rounded-lg border border-signal-rule bg-secondary/40 p-5">
            <h2 className="font-semibold font-serif text-[0.7rem] text-signal-green uppercase tracking-wider">
              Sources
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {article.sources.map((source) => (
                <li key={source.url}>
                  <a
                    className="text-signal-green underline underline-offset-2 hover:text-signal-green-dark"
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

      <SubscribeBand />
    </>
  );
}
