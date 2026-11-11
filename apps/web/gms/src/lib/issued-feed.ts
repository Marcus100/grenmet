import type { IssuedProducts } from "@barrelsgd/api-client";
import { PRODUCT_KINDS } from "@barrelsgd/gms/products";

/**
 * RSS 2.0 for issued GMS products (issue #1197, F4): one item per published
 * product, newest first, linking to its permanent page with its PDF as the
 * enclosure. Pure, so the route only fetches and serves.
 */

type Issued = IssuedProducts["products"][number];

const FEED_TITLE = "Grenada Meteorological Service: issued products";
const SUMMARY_LIMIT = 300;
const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;
const TRAILING_SLASHES = /\/+$/u;
const XML_SPECIAL = /[<>&"']/gu;
const XML_ESCAPES: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  '"': "&quot;",
  "'": "&apos;",
};

/** XML 1.0 forbids C0 controls other than tab, newline and carriage return. */
function xmlAllowed(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

export function xmlEscape(text: string): string {
  return [...text]
    .filter(xmlAllowed)
    .join("")
    .replace(XML_SPECIAL, (character) => XML_ESCAPES[character] ?? "");
}

function kindLabel(kind: string): string {
  return kind in PRODUCT_KINDS
    ? PRODUCT_KINDS[kind as keyof typeof PRODUCT_KINDS]
    : "Weather product";
}

/** "Morning Forecast, 11 Nov 2026, 7:00 a.m." in Grenada time. */
function itemTitle(product: Issued): string {
  const issued = product.values.issuedAt ?? "";
  const issuedAt = LOCAL_MINUTE.test(issued)
    ? new Date(`${issued}:00-04:00`)
    : null;
  const when =
    issuedAt && !Number.isNaN(issuedAt.getTime())
      ? issuedAt
      : new Date(product.publishedAt);
  // An unreadable time never breaks the feed; the item keeps its kind.
  if (Number.isNaN(when.getTime())) return kindLabel(product.kind);
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Grenada",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(when)
    .replace(" am", " a.m.")
    .replace(" pm", " p.m.");
  return `${kindLabel(product.kind)}, ${label}`;
}

function summary(product: Issued): string {
  const text = (
    product.values.summary ??
    product.values.synopsis ??
    product.values.headline ??
    ""
  ).trim();
  return text.length > SUMMARY_LIMIT
    ? `${text.slice(0, SUMMARY_LIMIT - 1)}…`
    : text;
}

export function issuedFeedXml(
  products: readonly Issued[],
  siteUrl: string,
  now: Date = new Date()
): string {
  const site = siteUrl.replace(TRAILING_SLASHES, "");
  const items = products.map((product) => {
    const page = `${site}/weather/issued/${product.id}`;
    const description = summary(product);
    return [
      "    <item>",
      `      <title>${xmlEscape(itemTitle(product))}</title>`,
      `      <link>${xmlEscape(page)}</link>`,
      `      <guid isPermaLink="false">${product.id}-r${product.revision}</guid>`,
      `      <pubDate>${new Date(product.publishedAt).toUTCString()}</pubDate>`,
      `      <category>${xmlEscape(kindLabel(product.kind))}</category>`,
      description
        ? `      <description>${xmlEscape(description)}</description>`
        : "",
      `      <enclosure url="${xmlEscape(`${page}/pdf`)}" type="application/pdf" length="0"/>`,
      "    </item>",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${xmlEscape(FEED_TITLE)}</title>`,
    `    <link>${xmlEscape(`${site}/weather/issued`)}</link>`,
    `    <atom:link href="${xmlEscape(`${site}/weather/issued/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    "    <description>Forecasts, marine forecasts, bulletins and outlooks as GMS issued them.</description>",
    "    <language>en</language>",
    `    <lastBuildDate>${now.toUTCString()}</lastBuildDate>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
