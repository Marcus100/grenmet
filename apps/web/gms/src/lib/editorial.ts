import { contentHref, type PublishedContent } from "@/lib/cms";

/** A product update as the desk feed shows it: a headline, its paragraphs and picture. */
export interface ProductPost {
  href: string;
  id: string;
  imageUrl: string;
  issuedAt: string;
  paragraphs: string[];
  source: string;
  summary: string;
  title: string;
}

export interface WeatherArticle {
  body?: string;
  href: string;
  id: number | string;
  imageUrl: string;
  published: string;
  sections?: { heading: string; paragraphs: string[] }[];
  slug: string;
  sources?: { title: string; url: string }[];
  summary: string;
  title: string;
}
/**
 * Stock picture for a post that has none of its own. A fallback for real posts
 * only: it is never used as a sample post. Owner decision pending on keeping it.
 */
const FALLBACK_ARTICLE_IMAGE =
  "https://images.unsplash.com/photo-1504370805625-d32c54b16100?auto=format&fit=crop&w=1000&q=80";

/** A CMS post in the shape the article and feed components read. */
export function contentToArticle(content: PublishedContent): WeatherArticle {
  return {
    id: content.id,
    slug: content.slug,
    title: content.title,
    summary: content.summary ?? "",
    imageUrl: content.imageUrl ?? FALLBACK_ARTICLE_IMAGE,
    // Grenada time, whatever time zone the server runs in.
    published: new Date(
      content.publishedAt ?? content.updatedAt
    ).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      timeZone: "America/Grenada",
      year: "numeric",
    }),
    href: contentHref(content),
    body: content.body,
  };
}
