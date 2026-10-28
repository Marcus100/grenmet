import type { PostSummary } from "@/lib/posts";

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char] ?? char);
}

/** RSS 2.0 document for the posts, which must already be published and sorted. */
export function renderFeed(
  siteUrl: string,
  posts: readonly PostSummary[]
): string {
  const items = posts.map((post) => {
    const link = `${siteUrl}/#${post.slug}`;
    const title = post.release ? `${post.release}: ${post.title}` : post.title;
    return [
      "<item>",
      `<title>${escapeXml(title)}</title>`,
      `<link>${escapeXml(link)}</link>`,
      `<guid isPermaLink="true">${escapeXml(link)}</guid>`,
      `<pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate>`,
      `<description>${escapeXml(post.summary)}</description>`,
      "</item>",
    ].join("");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    "<title>Commit</title>",
    `<link>${escapeXml(siteUrl)}</link>`,
    "<description>How Barrels Grenada builds its platform, release by release.</description>",
    "<language>en</language>",
    `<atom:link href="${escapeXml(`${siteUrl}/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    "</channel>",
    "</rss>",
  ].join("\n");
}
