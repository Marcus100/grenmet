import { Logo } from "@barrelsgd/gms/components/logo";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { fetchContentBySlug } from "@/lib/cms";
import { contentToArticle } from "@/lib/editorial";

const SECTIONS = {
  "latest-from-us": { title: "Latest from us", href: "/explore/updates" },
  "weather-news": { title: "Stories", href: "/explore/news" },
  "latest-publications": {
    title: "Latest publications",
    href: "/explore/news",
  },
} as const;

/** Running text on the type scale: 16/24 body, condensed h2, a readable measure. */
const PROSE =
  "max-w-prose space-y-4 text-body-base leading-body-base [&_a]:text-gm-blue-ink [&_a]:underline [&_h2]:mt-8 [&_h2]:font-bold [&_h2]:font-gm-display [&_h2]:text-gm-heading [&_h2]:text-heading-md [&_h2]:leading-heading-md [&_h3]:font-bold [&_h3]:text-gm-heading [&_h3]:text-heading-sm [&_h3]:leading-heading-sm [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc";

const ASIDE_BOX =
  "flex flex-col gap-2 rounded-gm-card border border-gm-border p-4 text-body leading-body";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugParts } = await params;
  const slug = slugParts.join("/");
  const result = await fetchContentBySlug(slug);
  return { title: result.articles[0]?.title ?? "GMS article" };
}

/**
 * An editorial article (Bold sky explainer layout). The lime band marks it as
 * editorial; the aside always points to the official forecast, so a story is
 * never mistaken for a product.
 */
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugParts } = await params;
  const slug = slugParts.join("/");
  const result = await fetchContentBySlug(slug);
  if (result.status === "unavailable") {
    return (
      <p className="py-6 text-body-base leading-body-base" role="status">
        This article cannot be retrieved right now. Please try again later.
      </p>
    );
  }
  const content = result.articles[0];
  if (!content) notFound();
  const article = contentToArticle(content);
  const section = SECTIONS[content.section ?? "latest-publications"];

  return (
    <>
      <p className="mt-3 flex flex-wrap items-center gap-2 border-gm-border border-b pb-3 text-body-sm text-gm-text-secondary leading-body-sm">
        <span className="rounded bg-gm-lime px-2 py-0.5 font-bold text-gm-navy text-label uppercase leading-label tracking-wider">
          Earth &amp; Weather
        </span>
        Editorial content. For official forecasts and warnings, see{" "}
        <Link className="text-gm-blue-ink underline" href="/weather">
          Weather
        </Link>
        .
      </p>

      <div className="grid gap-8 pt-6 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
        <article className="min-w-0">
          <header className="flex flex-col gap-3">
            <p className="font-bold text-gm-sky-ink text-label uppercase leading-label tracking-widest">
              {section.title}
            </p>
            <h1 className="max-w-[24ch] text-balance font-bold font-gm-display text-gm-display text-gm-heading uppercase tracking-wide">
              {article.title}
            </h1>
            {content.category && (
              <p className="font-semibold text-body text-gm-text-secondary leading-body">
                {content.category}
              </p>
            )}
            <p className="max-w-prose text-body-base text-gm-text-secondary leading-body-base">
              {article.summary}
            </p>
            <div className="flex items-center gap-3 border-gm-border border-y py-3 text-body-sm leading-body-sm">
              <span className="dark flex size-10 items-center justify-center rounded-full bg-gm-navy">
                <Logo className="size-6" variant="icon" />
              </span>
              <span>
                <b className="text-gm-heading">
                  Grenada Meteorological Service
                </b>
                <br />
                <span className="text-gm-text-secondary">
                  Updated {article.published}
                </span>
              </span>
            </div>
          </header>

          <div className="mt-6">
            {article.body ? (
              <div className={PROSE}>
                <ReactMarkdown>{article.body}</ReactMarkdown>
              </div>
            ) : (
              article.sections?.map((part) => (
                <section className={PROSE} key={part.heading}>
                  <h2>{part.heading}</h2>
                  {part.paragraphs.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </section>
              ))
            )}
          </div>

          {Boolean(article.sources?.length) && (
            <p className="mt-8 max-w-prose border-gm-border border-t pt-3 text-body-sm text-gm-text-secondary leading-body-sm">
              Further reading:{" "}
              {article.sources?.map((source, i) => (
                <span key={source.url}>
                  {i > 0 && " · "}
                  <a className="text-gm-blue-ink underline" href={source.url}>
                    {source.title}
                  </a>
                </span>
              ))}
            </p>
          )}
        </article>

        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-28">
          <div
            className={`${ASIDE_BOX} border-transparent bg-gm-surface-panel`}
          >
            <h2 className="font-bold text-gm-text-secondary text-label uppercase leading-label tracking-wider">
              Official forecast
            </h2>
            <Link
              className="flex items-center gap-1 font-semibold text-gm-blue-ink hover:underline"
              href="/weather"
            >
              Today&apos;s forecast
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
            <Link
              className="flex items-center gap-1 font-semibold text-gm-blue-ink hover:underline"
              href="/alerts"
            >
              Warnings in effect
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>

          {Boolean(content.relatedLinks?.length) && (
            <section aria-labelledby="related-links" className={ASIDE_BOX}>
              <h2
                className="font-bold text-gm-text-secondary text-label uppercase leading-label tracking-wider"
                id="related-links"
              >
                Related products and reading
              </h2>
              <ul className="flex flex-col gap-1.5">
                {content.relatedLinks?.map((link) => (
                  <li key={link.url}>
                    <a
                      className="font-semibold text-gm-blue-ink hover:underline"
                      href={link.url}
                    >
                      {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Link
            className="flex items-center gap-1 font-semibold text-body text-gm-blue-ink leading-body hover:underline"
            href={section.href}
          >
            More from {section.title}
          </Link>
        </aside>
      </div>
    </>
  );
}
