/**
 * Builds the FastAPI URL for the shared `/api/*` proxy from the browser path.
 *
 * The browser path is never used as a URL. It is split into segments, each
 * segment is percent-decoded once, and each decoded segment must be a plain
 * token: letters, digits, `.`, `_`, `~` or `-`, not `.` or `..`. Anything else
 * (empty segments from `//`, encoded slashes, `:` or `@` that could start a
 * host, `%` that could hide a second encoding) is refused. The one exception
 * is a single final `/` (for example `/api/v1/utils/ready/`), which is kept. The URL is then
 * assembled from a fixed base origin plus those validated segments, so the
 * browser can change the path under the API base and nothing else.
 *
 * Returns null when the path is not acceptable. The caller answers 400 and
 * sends no request upstream.
 */
const SEGMENT = /^[A-Za-z0-9._~-]+$/;

export function buildApiProxyUrl(
  pathname: string,
  search: string,
  apiBaseUrl: string
): URL | null {
  if (!pathname.startsWith("/api/") || pathname === "/api/") return null;

  const trailingSlash = pathname.endsWith("/");
  const body = trailingSlash ? pathname.slice(0, -1) : pathname;

  const segments: string[] = [];
  for (const raw of body.slice(1).split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (decoded === "." || decoded === ".." || !SEGMENT.test(decoded)) {
      return null;
    }
    segments.push(decoded);
  }

  const base = new URL(apiBaseUrl);
  const url = new URL(base.href);
  url.pathname = `/${segments.join("/")}${trailingSlash ? "/" : ""}`;
  url.search = search;
  url.hash = "";

  if (url.origin !== base.origin) return null;
  return url;
}
