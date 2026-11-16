import { absoluteUrl } from "@barrelsgd/ui/lib/seo";

/** Sign-in callbacks, the feedback endpoint and runtime config: never indexed. */
export const PRIVATE_DISALLOW = ["/api/", "/auth/", "/runtime-env.js"] as const;

/** The public URL path of a content page; `index` is the home page. */
export function pagePath(contentPath: string): string {
  const normalised = contentPath.replaceAll("\\", "/");
  return normalised === "index" ? "/" : `/${normalised}`;
}

/** One sitemap entry per content page, on the docs host. */
export function buildSitemap(
  siteUrl: string,
  contentPaths: readonly string[]
): { url: string }[] {
  return [...new Set(contentPaths.map(pagePath))].map((path) => ({
    url: absoluteUrl(siteUrl, path),
  }));
}
