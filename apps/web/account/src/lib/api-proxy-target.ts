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
 * One narrow exception allows `:` (baseline policy keys such as `hr:gms:LEAVE`).
 * It applies only to the key segment of the policy route
 * `/api/v1/hr/setup/policies/{key}`, matched on the decoded literal segments
 * before it. The generated client percent-encodes the key, so the colon arrives
 * as `%3A` and is accepted after decoding. The key is the last segment and is
 * never the first, so it cannot start an authority, and the fixed base origin
 * still applies. Everywhere else `:` is refused.
 *
 * Returns null when the path is not acceptable. The caller answers 400 and
 * sends no request upstream.
 */
const SEGMENT = /^[A-Za-z0-9._~-]+$/u;
const POLICY_KEY_SEGMENT = /^[A-Za-z0-9._~:-]+$/u;
const POLICY_ROUTE = ["api", "v1", "hr", "setup", "policies"] as const;

function isPolicyRoute(decoded: readonly string[]): boolean {
  return (
    decoded.length === POLICY_ROUTE.length + 1 &&
    POLICY_ROUTE.every((literal, index) => decoded[index] === literal)
  );
}

export function buildApiProxyUrl(
  pathname: string,
  search: string,
  apiBaseUrl: string
): URL | null {
  if (!pathname.startsWith("/api/") || pathname === "/api/") return null;

  const trailingSlash = pathname.endsWith("/");
  const body = trailingSlash ? pathname.slice(0, -1) : pathname;

  const decoded: string[] = [];
  for (const raw of body.slice(1).split("/")) {
    try {
      decoded.push(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }

  const policyKeyIndex = isPolicyRoute(decoded) ? decoded.length - 1 : -1;

  const segments: string[] = [];
  for (const [index, segment] of decoded.entries()) {
    const pattern = index === policyKeyIndex ? POLICY_KEY_SEGMENT : SEGMENT;
    if (segment === "." || segment === ".." || !pattern.test(segment)) {
      return null;
    }
    segments.push(segment);
  }

  const base = new URL(apiBaseUrl);
  const url = new URL(base.href);
  url.pathname = `/${segments.join("/")}${trailingSlash ? "/" : ""}`;
  url.search = search;
  url.hash = "";

  if (url.origin !== base.origin) return null;
  return url;
}
