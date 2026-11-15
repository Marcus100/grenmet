import { absoluteUrl, breadcrumbList } from "@barrelsgd/ui/lib/seo";
import { getSection } from "@/lib/nav";
import { STORY_IMAGES } from "@/lib/story-images";

export interface ArticleForData {
  readonly author: string;
  readonly dek: string;
  readonly publishedAt: string;
  readonly section: string;
  readonly slug: string;
  readonly title: string;
}

/** The image a story shows, when it is a file on this site (never an outside link). */
export function articleImageUrl(
  siteUrl: string,
  section: string,
  slug: string
): string | undefined {
  const src = STORY_IMAGES[`${section}/${slug}`]?.src;
  return src?.startsWith("/") ? absoluteUrl(siteUrl, src) : undefined;
}

/** schema.org NewsArticle for an article page, with a matching breadcrumb trail. */
export function newsArticleJsonLd(
  siteUrl: string,
  article: ArticleForData
): Record<string, unknown> {
  const path = `/${article.section}/${article.slug}`;
  const image = articleImageUrl(siteUrl, article.section, article.slug);
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.dek,
    datePublished: article.publishedAt,
    dateModified: article.publishedAt,
    mainEntityOfPage: absoluteUrl(siteUrl, path),
    author: { "@type": "Person", name: article.author },
    publisher: {
      "@type": "Organization",
      name: "Grenada Signal",
      url: absoluteUrl(siteUrl, "/"),
    },
    ...(image ? { image: [image] } : {}),
  };
}

export function articleBreadcrumbJsonLd(
  siteUrl: string,
  article: Pick<ArticleForData, "section" | "slug" | "title">
): Record<string, unknown> {
  const sectionLabel = getSection(article.section)?.label ?? article.section;
  return breadcrumbList(siteUrl, [
    { name: "Signal", path: "/" },
    { name: sectionLabel, path: `/${article.section}` },
    { name: article.title, path: `/${article.section}/${article.slug}` },
  ]);
}
