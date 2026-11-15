/*
  Search-engine helpers shared by the public Barrels sites. Pure functions
  only: no request, cookie or environment reads, so every app can call them
  with its own site address and the tests need no framework.
*/

const TRAILING_SLASHES = /\/+$/u;

/** Paths a crawler must not fetch: staff, sign-in, tokens and machine endpoints. */
export interface RobotsRules {
  rules: {
    allow: string;
    disallow: string[];
    userAgent: string;
  };
  sitemap: string;
}

/**
 * The robots.txt rules for one site: everything public is allowed, `disallow`
 * lists the private prefixes, and the sitemap points at the site's own host.
 */
export function robotsRules(input: {
  readonly disallow: readonly string[];
  readonly siteUrl: string;
}): RobotsRules {
  const base = input.siteUrl.replace(TRAILING_SLASHES, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // A copy: the caller's array must not change the rules after they are built.
      disallow: [...input.disallow],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}

/** An absolute URL on the site for a path such as `/events/x`. */
export function absoluteUrl(siteUrl: string, path: string): string {
  const base = siteUrl.replace(TRAILING_SLASHES, "");
  if (path === "/" || path === "") {
    return `${base}/`;
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * JSON-LD text that is safe inside a `<script type="application/ld+json">`.
 * `<`, `>` and `&` are escaped so a value can never close the script tag, and
 * the two line separators are escaped because older parsers choke on them.
 */
export function jsonLdText(value: Record<string, unknown>): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");
}

/** A schema.org BreadcrumbList for a page's trail, starting at the home page. */
export function breadcrumbList(
  siteUrl: string,
  trail: readonly { readonly name: string; readonly path: string }[]
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: absoluteUrl(siteUrl, step.path),
    })),
  };
}

/** A schema.org WebSite for a site's home page. */
export function websiteJsonLd(input: {
  readonly description?: string;
  readonly name: string;
  readonly siteUrl: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: input.name,
    url: absoluteUrl(input.siteUrl, "/"),
    ...(input.description ? { description: input.description } : {}),
  };
}
