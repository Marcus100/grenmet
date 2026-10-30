import { Logo } from "@barrelsgd/gms/components/logo";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { FeaturedLink } from "@/components/featured-link";
import { RelatedLinkAnchor } from "@/components/related-link-anchor";
import { fetchContentBySlug, type PublishedContent } from "@/lib/cms";
import { contentToArticle } from "@/lib/editorial";

const SECTIONS = {
  "desk-updates": { title: "From the Desk", href: "/explore/updates" },
  stories: { title: "Stories", href: "/explore/news" },
  "report-notes": { title: "Latest reports", href: "/explore/reports" },
} as const;

/** Running text on the type scale: 16/24 body, condensed h2, a readable measure. */
const PROSE =
  "max-w-prose space-y-4 text-body-base leading-body-base [&_a]:text-gm-blue-ink [&_a]:underline [&_h2]:mt-8 [&_h2]:font-bold [&_h2]:font-gm-display [&_h2]:text-gm-heading [&_h2]:text-heading-md [&_h2]:leading-heading-md [&_h3]:font-bold [&_h3]:text-gm-heading [&_h3]:text-heading-sm [&_h3]:leading-heading-sm [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc";

const ASIDE_BOX =
  "flex flex-col gap-2 rounded-gm-card border border-gm-border p-4 text-body leading-body";

/** Page metadata for a CMS article by its full slug. */
export async function cmsArticleMetadata(slug: string) {
  const result = await fetchContentBySlug(slug);
  return { title: result.articles[0]?.title ?? "GMS article" };
}

/**
 * An editorial article (Bold sky explainer layout). The lime band marks it as
 * editorial; the aside always points to the official forecast, so a story is
 * never mistaken for a product.
 */
export async function CmsArticle({ slug }: { slug: string }) {
  const result = await fetchContentBySlug(slug);
  if (result.status === "unavailable") {
    return (
      <p className="text-body-base leading-body-base py-6" role="status">
        This article cannot be retrieved right now. Please try again later.
      </p>
    );
  }
  const content = result.articles[0];
  if (!content) notFound();
  return <CmsArticleBody content={content} />;
}

/**
 * The article as it reads on the site. A draft preview renders through this
 * too, so the preview cannot differ from the published page.
 */
export function CmsArticleBody({ content }: { content: PublishedContent }) {
  const article = contentToArticle(content);
  const section = SECTIONS[content.collection];
  // The main link is a card; the others are plain links beneath it.
  const links = content.relatedLinks ?? [];
  // An issued product stays a plain link (owner, 29 Oct 2026): only a
  // warning or a GMS page becomes the card.
  const main = links.find(
    (link) => link.isMain && (link.type === "cap" || link.type === "page")
  );
  const others = links.filter((link) => link !== main);

  return (
    <>
      <p className="border-gm-border text-body-sm text-gm-text-secondary leading-body-sm mt-3 flex flex-wrap items-center gap-2 border-b pb-3">
        <span className="bg-gm-lime text-gm-navy text-label leading-label rounded px-2 py-0.5 font-bold tracking-wider uppercase">
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
            <p className="text-gm-sky-ink text-label leading-label font-bold tracking-widest uppercase">
              {section.title}
            </p>
            <h1 className="font-gm-display text-gm-display text-gm-heading max-w-[24ch] font-bold tracking-wide text-balance uppercase">
              {article.title}
            </h1>
            {content.category && (
              <p className="text-body text-gm-text-secondary leading-body font-semibold">
                {content.category}
              </p>
            )}
            <p className="text-body-base text-gm-text-secondary leading-body-base max-w-prose">
              {article.summary}
            </p>
            <div className="border-gm-border text-body-sm leading-body-sm flex items-center gap-3 border-y py-3">
              <span className="dark bg-gm-navy flex size-10 items-center justify-center rounded-full">
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
            <p className="border-gm-border text-body-sm text-gm-text-secondary leading-body-sm mt-8 max-w-prose border-t pt-3">
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
          {main && <FeaturedLink link={main} />}
          <div
            className={`${ASIDE_BOX} bg-gm-surface-panel border-transparent`}
          >
            <h2 className="text-gm-text-secondary text-label leading-label font-bold tracking-wider uppercase">
              Official forecast
            </h2>
            <Link
              className="text-gm-blue-ink flex items-center gap-1 font-semibold hover:underline"
              href="/weather"
            >
              Today&apos;s forecast
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
            <Link
              className="text-gm-blue-ink flex items-center gap-1 font-semibold hover:underline"
              href="/alerts"
            >
              Warnings in effect
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>

          {others.length > 0 && (
            <section aria-labelledby="related-links" className={ASIDE_BOX}>
              <h2
                className="text-gm-text-secondary text-label leading-label font-bold tracking-wider uppercase"
                id="related-links"
              >
                Related products and reading
              </h2>
              <ul className="flex flex-col gap-1.5">
                {others.map((link) => (
                  <li key={link.url}>
                    <RelatedLinkAnchor link={link} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Link
            className="text-body text-gm-blue-ink leading-body flex items-center gap-1 font-semibold hover:underline"
            href={section.href}
          >
            More from {section.title}
          </Link>
        </aside>
      </div>
    </>
  );
}
