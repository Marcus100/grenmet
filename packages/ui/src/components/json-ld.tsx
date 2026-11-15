import { jsonLdText } from "../lib/seo";

/**
 * Structured data for search engines, rendered as a JSON-LD script. Server
 * Component safe: no client state, no browser APIs.
 *
 * React writes a script element's text child as-is, and jsonLdText escapes
 * <, >, & and line separators, so the payload cannot close the script tag.
 */
export function JsonLd({ data }: Readonly<{ data: Record<string, unknown> }>) {
  return <script type="application/ld+json">{jsonLdText(data)}</script>;
}
